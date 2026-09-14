"""Independently recompute saved HR scores and audit output completeness."""
import json
from pathlib import Path
import numpy as np

BASE = Path(__file__).resolve().parent / 'artifacts/mpu-toolbox'
report = json.loads((BASE / 'results.json').read_text())
assert len(report['clips']) == 15
assert len(report['recordings']) == 5
methods = ['POS', 'CHROM', 'GREEN', 'TS-CAN']


def hr(x):
    if not np.all(np.isfinite(x)) or np.std(x) < 1e-12:
        return None
    # Independent FFT construction: scipy.periodogram uses a periodic Hann,
    # after removing the unweighted mean. Scaling does not alter argmax.
    window = .5 - .5 * np.cos(2 * np.pi * np.arange(len(x)) / len(x))
    power = abs(np.fft.rfft((x - np.mean(x)) * window, n=16384)) ** 2
    f = np.fft.rfftfreq(16384, d=1/30)
    mask = (f >= .7) & (f <= 3)
    return float(f[mask][np.argmax(power[mask])] * 60)


for bpm in [45, 72, 90, 120, 165]:
    t = np.arange(240) / 30
    assert abs(hr(np.sin(2*np.pi*bpm/60*t)) - bpm) < .25
assert hr(np.zeros(240)) is None

diagnostics = []
errors = {m: [] for m in methods}
additional = {m: [] for m in methods}
for clip in report['clips']:
    assert len(clip['windows']) == 26 * 4
    folder = BASE / clip['recording'] / clip['segment']
    with np.load(folder / 'outputs.npz') as f:
        assert len(f['t']) == 3600
        assert len(np.unique(f['sourceIndices'])) == 3600
        assert np.all(np.diff(f['t']) > 0)
        assert all(len(f[m]) == 3600 for m in methods)
        refdiff = []
        for row in clip['windows']:
            mask = (f['t'] >= row['start']) & (f['t'] < row['end'])
            assert 239 <= sum(mask) <= 241
            value = hr(f[row['method']][mask])
            assert value == row['hr'], (clip['recording'], clip['segment'], row, value)
            if row['referenceValid'] and value is not None:
                error = value - row['deviceHR']
                errors[row['method']].append(error)
                if clip['recording'] != '8':
                    additional[row['method']].append(error)
            if row['method'] == 'POS':
                refhr = hr(f['reference'][mask])
                if refhr is not None and row['referenceValid']:
                    refdiff.append(abs(refhr-row['deviceHR']))
        diagnostics.append(dict(recording=clip['recording'], segment=clip['segment'],
                                referenceSpectralVsDeviceHRMAE=float(np.mean(refdiff)) if refdiff else None,
                                adjacentIdenticalCropMeanRGBFraction=float(np.mean(np.all(np.diff(f['cropRGB'], axis=0) == 0, axis=1)))))
for method in methods:
    assert report['aggregate'][method]['plannedWindows'] == 390
    assert report['additionalRecordingsOnly'][method]['plannedWindows'] == 312
    for key, values in [('aggregate', errors[method]), ('additionalRecordingsOnly', additional[method])]:
        assert len(values) == report[key][method]['scoredWindows']
        assert abs(float(np.mean(np.abs(values))) - report[key][method]['maeBpm']) < 1e-10
        assert abs(float(np.mean(np.array(values) ** 2)**.5) - report[key][method]['rmseBpm']) < 1e-10

audit = dict(status='PASS', clips=15, windowsPerMethod=390, independentFFTAgreement=True,
             note='Reference spectral/device HR consistency is exploratory, not a second accuracy ground truth. Identical RGB means do not prove identical full images.',
             diagnostics=diagnostics)
(BASE / 'verification.json').write_text(json.dumps(audit, indent=2))
print(json.dumps(audit, indent=2))
