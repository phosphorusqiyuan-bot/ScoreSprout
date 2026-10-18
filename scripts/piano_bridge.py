"""Offline PM2S hand assignment and PianoPlayer MusicXML fingering bridge."""

import json
import sys
from pathlib import Path
from xml.etree import ElementTree as ET


def assign_hands(input_path, weights_path, output_path):
    import torch
    from pm2s_hand_model import load_model

    data = json.loads(Path(input_path).read_text(encoding="utf-8"))
    notes = data["notes"]
    if not notes:
        raise ValueError("No piano notes")
    bpm, ppq = float(data["bpm"]), float(data["ppq"])
    if not (20 <= bpm <= 400 and ppq > 0 and len(notes) <= 8000):
        raise ValueError("Invalid piano score timing or size")
    seconds_per_tick = 60.0 / (bpm * ppq)
    rows = []
    for note in notes:
        pitch = int(note["pitch"])
        start, duration = float(note["start"]), float(note["duration"])
        velocity = int(note["velocity"])
        if not (0 <= pitch <= 127 and 0 <= start < 10_000_000 and
                0 < duration < 10_000_000 and 1 <= velocity <= 127):
            raise ValueError("Invalid piano note")
        rows.append([pitch, start * seconds_per_tick, duration * seconds_per_tick, velocity])

    model = load_model(weights_path)
    # The bidirectional RNN needs local context; overlap avoids hard seams on
    # long scores without allocating an 8000-note recurrent graph at once.
    scores = [0.0] * len(rows)
    counts = [0] * len(rows)
    with torch.inference_mode():
        for begin in range(0, len(rows), 256):
            core_end = min(len(rows), begin + 256)
            left, right = max(0, begin - 32), min(len(rows), core_end + 32)
            chunk = torch.tensor(rows[left:right], dtype=torch.float32).unsqueeze(0)
            probabilities = model(chunk).squeeze(0).tolist()
            for index in range(begin, core_end):
                scores[index] += probabilities[index - left]
                counts[index] += 1
    labels = [int(scores[i] / counts[i] > 0.5) for i in range(len(rows))]
    labels_present = set(labels)
    if len(labels_present) == 2:
        mean = {label: sum(rows[i][0] for i, value in enumerate(labels) if value == label) /
                labels.count(label) for label in (0, 1)}
        right_label = 1 if mean[1] > mean[0] + 2 else 0
        hands = ["right" if value == right_label else "left" for value in labels]
    else:
        # A single detected voice has no identifiable two-hand performance.
        hands = ["right"] * len(rows)
    Path(output_path).write_text(json.dumps({"hands": hands, "modelLabels": labels}), encoding="utf-8")


def _musical_notes(path):
    root = ET.parse(path).getroot()
    return [tuple((note.find(tag) is not None if tag in {"rest", "chord"} else
                   (note.findtext(tag) or "")) for tag in
                  ("pitch/step", "pitch/alter", "pitch/octave", "unpitched/display-step",
                   "unpitched/display-octave", "rest", "chord", "duration", "voice", "staff", "type"))
            + tuple(tie.get("type") for tie in note.findall("tie"))
            for note in root.iter("note")]


def annotate_fingering(input_path, output_path, result_path):
    from pianoplayer.core import run_annotate

    before = _musical_notes(input_path)
    run_annotate(input_path, outputfile=output_path, quiet=True, sound_off=True,
                 depth=5, n_measures=10000)
    after = _musical_notes(output_path)
    if before != after:
        raise ValueError("PianoPlayer changed the score notes; fingering was discarded")
    root = ET.parse(output_path).getroot()
    fingers = [node.text for node in root.iter("fingering")]
    if any(finger not in {"1", "2", "3", "4", "5"} for finger in fingers):
        raise ValueError("PianoPlayer returned invalid finger numbers")
    Path(result_path).write_text(json.dumps({"fingeringCount": len(fingers)}), encoding="utf-8")


if __name__ == "__main__":
    try:
        if sys.argv[1] == "hands" and len(sys.argv) == 5:
            assign_hands(*sys.argv[2:])
        elif sys.argv[1] == "fingering" and len(sys.argv) == 5:
            annotate_fingering(*sys.argv[2:])
        else:
            raise ValueError("Invalid piano bridge arguments")
    except Exception as error:
        print(f"ScoreSprout piano processing failed: {error}", file=sys.stderr)
        sys.exit(1)
