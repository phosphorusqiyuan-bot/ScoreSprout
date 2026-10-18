"""Run the official SheetSage2 model on PCM supplied by ScoreSprout.

The model and its weights stay in the user's ignored local runtime. No audio is
sent to a service. Stdout contains only SCORESPROUT-prefixed JSON messages.
"""

import json
import os
import sys
from pathlib import Path


def report(stage, **details):
    print("SCORESPROUT:" + json.dumps({"stage": stage, **details}), flush=True)


def main():
    if len(sys.argv) != 4:
        raise ValueError("Expected PCM path, sample rate, and output directory")
    pcm_path = Path(sys.argv[1])
    sample_rate = int(sys.argv[2])
    output_dir = Path(sys.argv[3])
    if sample_rate != 22050:
        raise ValueError("Unexpected sample rate")

    import numpy as np
    import torch
    from transformers import AutoModel

    samples = np.fromfile(pcm_path, dtype="<f4")
    if not len(samples) or len(samples) > sample_rate * 600 or not np.isfinite(samples).all():
        raise ValueError("Invalid or overlong audio")
    use_cuda = (
        torch.cuda.is_available()
        and torch.cuda.is_bf16_supported()
        and os.environ.get("SCORESPROUT_SHEETSAGE_DEVICE") != "cpu"
    )
    report("loading", device="cuda" if use_cuda else "cpu")
    model = AutoModel.from_pretrained(
        "m-a-p/SheetSage2", trust_remote_code=True,
        revision="b83c3d79a6d98bcffaf8f9ed112c90aa887887bc",
        local_files_only=True,
        torch_dtype=torch.bfloat16 if use_cuda else torch.float32,
    ).eval()
    if use_cuda:
        model = model.to("cuda")
    report("transcribing")

    def progress(info):
        stage = info.get("stage", "transcribing")
        if stage != "decoding" or info.get("tokens", 0) % 32 == 0:
            report(stage, window=info.get("window"), windows=info.get("windows"))

    try:
        result = model.transcribe(
            samples, sampling_rate=sample_rate, melody_only=True, progress=progress,
            dtype="bf16" if use_cuda else "fp32",
        )
    except RuntimeError as exc:
        # The model may reject ABC notation for a short or irregular recording
        # while still having usable melody MIDI. Keep that MIDI for the app.
        result = getattr(exc, "result", None)
        if result is None or not result.get("midis"):
            raise

    vocal = int(result.get("vocal_notes", 0))
    instrumental = int(result.get("instrumental_notes", 0))
    if not vocal and not instrumental:
        raise ValueError("SheetSage2 did not find a usable melody in this audio")
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "melody.mid").write_bytes(result["midis"]["melody"])
    (output_dir / "analysis.json").write_text(
        json.dumps({
            "chords": result.get("labs", {}).get("chord", ""),
            "beats": result.get("labs", {}).get("beat", ""),
            "downbeats": result.get("labs", {}).get("downbeat", ""),
        }, ensure_ascii=False), encoding="utf-8"
    )
    metadata = {
        "vocalNotes": vocal,
        "instrumentalNotes": instrumental,
        "noteCount": vocal + instrumental,
        "device": "cuda" if use_cuda else "cpu",
        "elapsedSeconds": result.get("elapsed_seconds"),
        "peakGpuMiB": result.get("peak_gpu_mib"),
        "warnings": result.get("warnings", []),
    }
    (output_dir / "result.json").write_text(
        json.dumps(metadata, ensure_ascii=False), encoding="utf-8"
    )
    report("complete", **metadata)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        report("error", message=str(exc))
        raise
