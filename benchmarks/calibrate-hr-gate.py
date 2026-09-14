"""Retrospective, recording-held-out HR threshold search. Never changes live gates."""
import json
import hashlib
from pathlib import Path
import numpy as np

BASE = Path(__file__).resolve().parent / 'artifacts'
OUT = BASE / 'hr-calibration'
OUT.mkdir(exist_ok=True)

def read(path):
    return json.loads(path.read_text())

def accepts(r, policy):
    if policy is None:
        return r.get('hr') is not None
    d = r.get('diagnostics') or {}
    return (d.get('candidateHr') is not None
            and min(d['rawConcentration'], d['filteredConcentration']) >= policy['concentration']
            and d['agreementMultiplier'] >= policy['agreement'])

def load_control(name):
    folder = BASE / 'control' / name
    scores = read(folder / 'stage-scores.json')['modes']['production']['rows']
    return (read(folder / 'session.json')['frames'],
            read(folder / 'stages.json')['runs']['production']['readouts'],
            {r['t']: (r['candidateErrorVsContact'], r['candidateErrorVsDevice']) for r in scores})

def evaluate(data, policy):
    frames, readings, errors = data
    by_time = {r['timestamp']: r for r in readings}
    eligible_start = frames[0]['t'] + 8
    available = eligible = 0.0
    accepted = False
    for i, frame in enumerate(frames):
        if i:
            previous = frames[i-1]
            dt = max(0, frame['t'] - max(previous['t'], eligible_start))
            eligible += dt
            if accepted and frame['t'] - previous['t'] <= .15:
                available += dt
        if frame['t'] in by_time:
            accepted = accepts(by_time[frame['t']], policy)
    selected = [errors[r['timestamp']] for r in readings
                if r['timestamp'] >= eligible_start and r['timestamp'] in errors and accepts(r, policy)]
    def mae(index):
        values = [x[index] for x in selected if x[index] is not None]
        return float(np.mean(values)) if values else None
    return dict(availability=available/eligible if eligible else 0,
                availableSeconds=available, eligibleSeconds=eligible, acceptedReadouts=len(selected),
                maeVsContact=mae(0), maeVsDevice=mae(1),
                acceptedDeviceErrorsOver10=sum(x[1] > 10 for x in selected))

control = {s: load_control(s) for s in ['subject1', 'subject3', 'subject4']}
folder = BASE / 'mpu-sample'
mpu_readings = read(folder / 'calibration-stages.json')['runs']['production']['readouts']
reference = np.genfromtxt(folder / 'reference.csv', delimiter=',', names=True)
t = reference['Count'] / 60
errors = {}
for r in mpu_readings:
    w = r.get('hrWindow')
    d = r.get('diagnostics') or {}
    if w and d.get('candidateHr') is not None:
        mask = (t >= w['start']) & (t <= w['end']) & (reference['HR'] > 0)
        if mask.any():
            errors[r['timestamp']] = (None, abs(d['candidateHr'] - float(np.median(reference['HR'][mask]))))
mpu = (read(folder / 'first120-wide.json')['frames'], mpu_readings, errors)
baseline_mpu = evaluate(mpu, None)
search = []
for concentration in np.round(np.arange(.4, .901, .05), 2):
    for agreement in np.round(np.arange(0, .801, .1), 2):
        policy = dict(concentration=float(concentration), agreement=float(agreement))
        good, failure = evaluate(control['subject1'], policy), evaluate(mpu, policy)
        feasible = (good['maeVsContact'] is not None and good['maeVsContact'] <= 3
                    and failure['acceptedDeviceErrorsOver10'] <= baseline_mpu['acceptedDeviceErrorsOver10'])
        search.append(dict(policy=policy, tuningControl=good, tuningFailure=failure, feasible=feasible))
feasible = [r for r in search if r['feasible']]
best = max(feasible, key=lambda r: (r['tuningControl']['availability'], r['policy']['concentration'], r['policy']['agreement'])) if feasible else None
results = {name: dict(baseline=evaluate(data, None), candidate=evaluate(data, best['policy']) if best else None)
           for name, data in {**control, 'mpu8-development': mpu}.items()}
passes = bool(best) and all(results[s]['candidate']['availability'] >= .9 and
                            results[s]['candidate']['maeVsContact'] <= 3 for s in ['subject3', 'subject4'])
report = dict(schema='pulse-cathedral/hr-calibration/1', selectedPolicy=best['policy'] if best else None,
              heldOutControlsPass=passes, independentFailureValidationAvailable=False,
              adopted=False, results=results, search=search,
              limitation='Retrospective controls; MPU8 is tuning only and its reference synchronization is unverified. No beat validation or production changes.')
sources = [Path(__file__), Path(__file__).with_name('HR-CALIBRATION.md'),
           Path(__file__).parent.parent / 'js/measurement.js',
           folder / 'calibration-stages.json', folder / 'first120-wide.json', folder / 'reference.csv']
for name in control:
    sources.extend(BASE / 'control' / name / f for f in ['session.json', 'stages.json', 'stage-scores.json'])
report['inputSha256'] = {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}
for name in control:
    expected = read(BASE / 'control' / name / 'stages.json')['runs']['production']['availability']
    assert abs(results[name]['baseline']['availability'] - expected) < 1e-9, name
assert abs(baseline_mpu['availability'] - read(folder / 'calibration-stages.json')['runs']['production']['availability']) < 1e-9
(OUT / 'results.json').write_text(json.dumps(report, indent=2, allow_nan=False))
lines = ['# HR acceptance calibration', '', f'Selected experimental policy: {report["selectedPolicy"]}. **Not adopted.**', '',
         '| Recording | Gate | Availability | Accepted readouts | MAE/contact bpm | MAE/device bpm | Device errors >10 bpm |',
         '|---|---|---:|---:|---:|---:|---:|']
for name, modes in results.items():
    for mode, r in modes.items():
        if r:
            fmt = lambda x: 'N/A' if x is None else f'{x:.2f}'
            lines.append(f'| {name} | {mode} | {100*r["availability"]:.1f}% | {r["acceptedReadouts"]} | {fmt(r["maeVsContact"])} | {fmt(r["maeVsDevice"])} | {r["acceptedDeviceErrorsOver10"]} |')
lines += ['', f'Held-out control criteria passed: {passes}. Independent failure validation is still absent.', '', report['limitation'], '',
          'Availability includes all elapsed time after initial eight-second warmup, including later resets. Error is readout-weighted on actual causal HR windows. Adjacent windows overlap and are not independent observations. Contact HR is a spectral estimate from the contact waveform, not beat-timing ground truth.']
(OUT / 'report.md').write_text('\n'.join(lines) + '\n')
print('\n'.join(lines))
