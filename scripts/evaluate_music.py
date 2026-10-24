"""Evaluate independently reviewed vocal-note/beat annotations, never model output as truth."""
import argparse
import json
from pathlib import Path
import numpy as np

import mir_eval


def evaluate(reference, prediction):
    result = {}
    if 'notes' in reference:
        def arrays(data):
            notes = sorted(data.get('notes', []), key=lambda n: n['start'])
            intervals = np.array([[n['start'], n['start'] + n['duration']] for n in notes], dtype=float).reshape(-1, 2)
            pitches = np.array([440 * 2 ** ((n['pitch'] - 69) / 12) for n in notes])
            return intervals, pitches
        r, p = arrays(reference), arrays(prediction)
        if not len(r[0]):
            raise ValueError('Reviewed note reference must contain notes; evaluate silent regions manually.')
        for offset, name in [(None, 'onset_pitch'), (.2, 'onset_pitch_offset')]:
            values = mir_eval.transcription.precision_recall_f1_overlap(*r, *p, onset_tolerance=.05,
                pitch_tolerance=50, offset_ratio=offset, offset_min_tolerance=.05, strict=False)
            result[name] = dict(zip(['precision', 'recall', 'f1', 'average_overlap'], map(float, values)))
    for name in ['beats', 'downbeats']:
        if name in reference:
            if len(reference[name]) < 2:
                result[name] = {'status': 'not_evaluated', 'reason': 'at least two reference beats required'}
            else:
                scores = mir_eval.beat.evaluate(np.asarray(reference[name], dtype=float),
                    np.asarray(prediction.get(name, []), dtype=float), min_beat_time=0)
                result[name] = {key: float(value) for key, value in scores.items()}
    if not result:
        raise ValueError('No reference notes/beats/downbeats provided.')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest', nargs='?', type=Path)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        ref = {'notes': [{'pitch': 69, 'start': 0, 'duration': .4}, {'pitch': 72, 'start': .5, 'duration': .4}],
               'beats': [0, .5, 1, 1.5, 2, 2.5, 3, 3.5]}
        scores = evaluate(ref, ref)
        assert scores['onset_pitch']['f1'] == 1
        assert scores['beats']['F-measure'] == 1
        wrong = {'notes': [{**n, 'pitch': n['pitch'] + 12} for n in ref['notes']]}
        assert evaluate({'notes': ref['notes']}, wrong)['onset_pitch']['f1'] == 0
        print('PASS: synthetic identity=1, octave-error=0; this is not a real-song accuracy result.')
        return
    if not args.manifest:
        parser.error('manifest is required unless --self-test is used')
    manifest = json.loads(args.manifest.read_text(encoding='utf-8'))
    reports = []
    for case in manifest['cases']:
        item = {'id': case['id'], 'scope': case.get('scope'), 'status': 'not_evaluated'}
        if case.get('reviewed') is not True or not case.get('reference') or not case.get('prediction'):
            item['reason'] = 'Independent human review and reference/prediction files are required.'
        else:
            try:
                base = args.manifest.parent
                reference = json.loads((base / case['reference']).read_text(encoding='utf-8'))
                prediction = json.loads((base / case['prediction']).read_text(encoding='utf-8'))
                item.update(status='evaluated', scores=evaluate(reference, prediction))
            except (OSError, ValueError, KeyError) as error:
                item.update(status='error', reason=str(error))
        reports.append(item)
    report = {'schema': 1, 'evaluated': sum(c['status'] == 'evaluated' for c in reports),
              'cases': reports, 'limitations': 'Note/beat metrics only. Rests, phrase breathing, playability and page layout require separate review.'}
    encoded = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(encoded, encoding='utf-8')
    print(encoded)
    if any(c['status'] == 'error' for c in reports):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
