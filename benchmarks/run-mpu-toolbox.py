"""Frozen, offline rPPG-Toolbox comparison on local MPU representative recordings.

No training or threshold tuning. Three preselected 120 s clips per recording.
Run with artifacts/toolbox-venv/bin/python from the repository root.
"""
import gc
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import time

import cv2
import numpy as np
import torch
import yaml
from scipy import signal
from yacs.config import CfgNode

ROOT = Path(__file__).resolve().parents[1]
UP = ROOT / 'benchmarks/artifacts/rPPG-Toolbox'
OUT = ROOT / 'benchmarks/artifacts/mpu-toolbox'
OUT.mkdir(exist_ok=True)
import sys
sys.path.insert(0, str(UP))
os.chdir(UP)
spec = importlib.util.spec_from_file_location('upstream_base', UP / 'dataset/data_loader/BaseLoader.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
BaseLoader = module.BaseLoader
from neural_methods.model.TS_CAN import TSCAN
from unsupervised_methods.methods.POS_WANG import POS_WANG
from unsupervised_methods.methods.CHROME_DEHAAN import CHROME_DEHAAN
from unsupervised_methods.methods.GREEN import GREEN
from evaluation.post_process import _detrend

FPS = 30
SECONDS = 120
METHODS = ['POS', 'CHROM', 'GREEN', 'TS-CAN']
config = yaml.safe_load((UP / 'configs/infer_configs/PURE_UBFC-rPPG_TSCAN_BASIC.yaml').read_text())
cfg = CfgNode(config['TEST']['DATA']['PREPROCESS'])
weight = UP / config['INFERENCE']['MODEL_PATH']
device = 'mps' if torch.backends.mps.is_available() else 'cpu'
model = TSCAN(frame_depth=10, img_size=72)
state = torch.load(weight, map_location='cpu', weights_only=True)
model.load_state_dict({k.removeprefix('module.'): v for k, v in state.items()}, strict=True)
model = model.to(device).eval()


def digest(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for block in iter(lambda: f.read(8 * 1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


class Video:
    """Sequential native-resolution RGB decode at nearest 30 Hz source PTS."""
    def __init__(self, path, indices, shape, folder):
        self.cap = cv2.VideoCapture(str(path))
        self.indices = indices
        self.shape = (len(indices), *shape, 3)
        self.last = -1
        self.folder = folder

    def __getitem__(self, i):
        if i == self.last:
            return self.cache
        target = int(self.indices[i])
        at = int(self.cap.get(cv2.CAP_PROP_POS_FRAMES))
        if target < at or target - at > 10:
            assert self.cap.set(cv2.CAP_PROP_POS_FRAMES, target)
            at = int(self.cap.get(cv2.CAP_PROP_POS_FRAMES))
        assert at <= target, (at, target)
        while at < target:
            assert self.cap.grab(), 'Source frame missing'
            at += 1
        ok, frame = self.cap.read()
        assert ok, 'Source frame missing'
        assert abs(self.cap.get(cv2.CAP_PROP_POS_FRAMES) - target - 1) < 1
        self.cache = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        self.last = i
        if i == 0:
            cv2.imwrite(str(self.folder / 'source-first.jpg'), frame)
        if i % 900 == 0:
            print('  decoded', i, '/', len(self.indices), flush=True)
        return self.cache


class Probe(BaseLoader):
    def face_detection(self, *args, **kwargs):
        # Audit using the same detector input; do not alter upstream fallback.
        detector = cv2.CascadeClassifier('./dataset/haarcascade_frontalface_default.xml')
        self.face_count = len(detector.detectMultiScale(args[0][:, :, :3].astype(np.uint8)))
        box = super().face_detection(*args, **kwargs)
        self.boxes.append(np.asarray(box).tolist())
        return box

    def crop_face_resize(self, *args, **kwargs):
        result = super().crop_face_resize(*args, **kwargs)
        self.cropped = result
        return result


def get_hr(x):
    if not np.all(np.isfinite(x)) or np.std(x) < 1e-12:
        return None
    f, p = signal.periodogram(x, FPS, window='hann', nfft=16384)
    mask = (f >= .7) & (f <= 3)
    return float(f[mask][p[mask].argmax()] * 60)


def summarize(rows):
    scored = [r for r in rows if r['hr'] is not None and r['referenceValid']]
    errors = np.array([r['hr'] - r['deviceHR'] for r in scored])
    return dict(plannedWindows=len(rows), scoredWindows=len(scored),
                outputCoverage=sum(r['hr'] is not None for r in rows) / len(rows),
                maeBpm=float(np.mean(abs(errors))) if len(errors) else None,
                biasBpm=float(np.mean(errors)) if len(errors) else None,
                rmseBpm=float(np.sqrt(np.mean(errors ** 2))) if len(errors) else None,
                within5Bpm=float(np.mean(abs(errors) <= 5)) if len(errors) else None)


inventory = json.loads((ROOT / 'benchmarks/artifacts/mpu-local-inventory.json').read_text())
protocol = dict(upstreamCommit=subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
                checkpoint=str(weight.relative_to(UP)), checkpointSHA256=digest(weight),
                config=config, fps=FPS, clipSeconds=SECONDS, device=device,
                selection='20 seconds, floor((duration-120)/2), floor(duration-140); all selected before inference',
                alignment='CSV Count equals encoded frame index; not verified physiological synchronization',
                sampling='Nearest source PTS to a 30 Hz grid, no duplicated selected frame indices',
                scoring='8-second windows every 4 seconds, excluding 8 seconds at either clip boundary; Hann FFT 0.7-3 Hz; median device HR',
                qualityGate='None. Finite nonflat outputs scored; reference HR must be finite and 30-220 bpm throughout window.',
                limitations=['Offline segment-wide normalization and zero-phase filtering; not live browser latency.',
                             'No IBI/HRV accuracy: acquisition clocks and reference beats unverified.',
                             'Recording IDs are not verified participant IDs; no subject-held-out claim.',
                             'Recording 8 duplicates our earlier development sample.',
                             'Published static face detector may fall back or lose the face; failures remain in results.',
                             'Overlapping windows are correlated; no confidence interval based on independent-window assumption.',
                             'Pretrained PURE model only; no fine tuning or production change.'])
plan = []
for item in inventory:
    video = Path(item['video'])
    name = video.parent.name if video.suffix == '.mp4' else 'root-hd'
    folder = OUT / name
    folder.mkdir(exist_ok=True)
    print('TIMESTAMP AUDIT', name, flush=True)
    ptsfile = folder / 'timestamps.npy'
    if ptsfile.exists():
        pts = np.load(ptsfile)
    else:
        raw = subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0',
                                      '-show_entries', 'frame=best_effort_timestamp_time', '-of', 'json', str(video)])
        pts = np.array([float(f['best_effort_timestamp_time']) for f in json.loads(raw)['frames']])
        np.save(ptsfile, pts)
    assert np.all(np.isfinite(pts)) and np.all(np.diff(pts) > 0), 'Invalid PTS'
    reference = np.genfromtxt(item['reference'], delimiter=',', names=True)
    assert len(reference) == len(pts), 'CSV/video frame count mismatch'
    assert np.array_equal(reference['Count'], np.arange(len(pts))), 'Noncontinuous Count'
    duration = pts[-1] - pts[0] + np.median(np.diff(pts))
    starts = [20, int((duration - SECONDS) // 2), int(duration - SECONDS - 20)]
    entry = dict(recording=name, video=str(video), reference=item['reference'], starts=starts,
                 frameCount=len(pts), duration=float(duration),
                 medianFrameInterval=float(np.median(np.diff(pts))),
                 maxFrameInterval=float(np.max(np.diff(pts))),
                 videoSHA256=digest(video), referenceSHA256=digest(item['reference']))
    plan.append(entry)
(OUT / 'protocol.json').write_text(json.dumps(dict(protocol=protocol, recordings=plan), indent=2))
print('PLAN SAVED before inference', flush=True)

all_results = []
for item, entry in zip(inventory, plan):
    pts = np.load(OUT / entry['recording'] / 'timestamps.npy')
    reference = np.genfromtxt(item['reference'], delimiter=',', names=True)
    stream = item['metadata']['streams'][0]
    for segment, start in zip(['early', 'middle', 'late'], entry['starts']):
        folder = OUT / entry['recording'] / segment
        folder.mkdir(exist_ok=True)
        print('RUN', entry['recording'], segment, start, flush=True)
        then = time.time()
        grid = pts[0] + start + np.arange(FPS * SECONDS) / FPS
        right = np.searchsorted(pts, grid)
        left = np.maximum(right - 1, 0)
        indices = np.where(abs(pts[left] - grid) <= abs(pts[right] - grid), left, right)
        assert len(np.unique(indices)) == len(indices)
        t = pts[indices]
        video = Video(item['video'], indices, (stream['height'], stream['width']), folder)
        loader = Probe.__new__(Probe)
        loader.boxes = []
        labels = reference['PPG'][indices]
        clips, _ = loader.preprocess(video, labels, cfg)
        video.cap.release()
        assert clips.shape == (20, 180, 72, 72, 6)
        cv2.imwrite(str(folder / 'crop-first.png'), cv2.cvtColor(loader.cropped[0].astype(np.uint8), cv2.COLOR_RGB2BGR))
        # Small local contact sheet verifies fixed box near early/middle/late positions.
        sheet = np.concatenate([loader.cropped[i].astype(np.uint8) for i in [0, 1800, 3599]], axis=1)
        cv2.imwrite(str(folder / 'crop-check.png'), cv2.cvtColor(sheet, cv2.COLOR_RGB2BGR))
        print('  classical methods; face count', loader.face_count, flush=True)
        b, a = signal.butter(1, [.6 / FPS * 2, 3.3 / FPS * 2], btype='bandpass')
        waves = {'POS': POS_WANG(loader.cropped, FPS), 'CHROM': CHROME_DEHAAN(loader.cropped, FPS),
                 'GREEN': signal.filtfilt(b, a, _detrend(GREEN(loader.cropped), 100))}
        pred = []
        with torch.inference_mode():
            for i in range(0, len(clips), 4):
                batch = np.ascontiguousarray(clips[i:i+4].transpose(0, 1, 4, 2, 3))
                tensor = torch.from_numpy(batch).float().flatten(0, 1).to(device)
                pred.append(model(tensor).flatten().cpu().numpy())
                del tensor, batch
        pred = np.concatenate(pred)
        assert len(pred) == len(t)
        waves['TS-CAN'] = signal.filtfilt(b, a, _detrend(np.cumsum(pred), 100))
        np.savez_compressed(folder / 'outputs.npz', t=t, reference=labels, sourceIndices=indices,
                            cropRGB=loader.cropped.mean(axis=(1, 2)), difference=pred, **waves)
        windows = []
        for begin in np.arange(start + 8, start + SECONDS - 8, 4):
            mask = (t >= pts[0] + begin) & (t < pts[0] + begin + 8)
            ri = (pts >= pts[0] + begin) & (pts < pts[0] + begin + 8)
            rawhr = reference['HR'][ri]
            valid = bool(len(rawhr) and np.all(np.isfinite(rawhr) & (rawhr >= 30) & (rawhr <= 220)))
            truth = float(np.median(rawhr))
            for method in METHODS:
                windows.append(dict(recording=entry['recording'], segment=segment, method=method,
                                    start=float(begin), end=float(begin + 8), hr=get_hr(waves[method][mask]),
                                    deviceHR=truth, referenceValid=valid))
        result = dict(recording=entry['recording'], segment=segment, start=start, seconds=SECONDS,
                      faceCount=loader.face_count, faceBoxes=loader.boxes, fallback=loader.face_count == 0,
                      elapsedSeconds=time.time() - then, maxSamplingErrorSeconds=float(max(abs(t-grid))),
                      referencePPGStd=float(np.std(labels)), referencePPGZeroFraction=float(np.mean(labels == 0)),
                      metrics={m: summarize([w for w in windows if w['method'] == m]) for m in METHODS}, windows=windows)
        (folder / 'results.json').write_text(json.dumps(result, indent=2, allow_nan=False))
        # Numeric-only browser visualization data. No video or facial images embedded.
        display = dict(t=t.tolist(), reference=labels.tolist(), signals={m: x.tolist() for m, x in waves.items()})
        (folder / 'waveforms.json').write_text(json.dumps(display, allow_nan=False))
        all_results.append(result)
        (OUT / 'progress.json').write_text(json.dumps(all_results, indent=2, allow_nan=False))
        print('  DONE', {m: round(result['metrics'][m]['maeBpm'], 2) if result['metrics'][m]['maeBpm'] is not None else None for m in METHODS}, flush=True)
        del loader, clips, video, pred, waves, display
        gc.collect()
        if device == 'mps':
            torch.mps.empty_cache()

windows = [w for r in all_results for w in r['windows']]
summary = dict(protocol=protocol, recordings=plan, clips=all_results,
               aggregate={m: summarize([w for w in windows if w['method'] == m]) for m in METHODS},
               additionalRecordingsOnly={m: summarize([w for w in windows if w['method'] == m and w['recording'] != '8']) for m in METHODS},
               byRecording={e['recording']: {m: summarize([w for w in windows if w['method'] == m and w['recording'] == e['recording']]) for m in METHODS} for e in plan})
(OUT / 'results.json').write_text(json.dumps(summary, indent=2, allow_nan=False))
print('COMPLETE', json.dumps(summary['additionalRecordingsOnly'], indent=2), flush=True)
