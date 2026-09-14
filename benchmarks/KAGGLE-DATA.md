# Kaggle subject 1 development replay

Source: https://www.kaggle.com/datasets/ashfakyeafi/rppg-dataset/data
Local-only research inspection. Kaggle lists the license as Unknown; no model training or redistribution was performed. Seven subjects / ten trials are listed; this run downloads only subject 1, trial 1.

## Reference admission

Downloaded video and BVP/HR/IBI/tags/info/track files. Individual-video download is ZIP wrapped; safely extracted only the single contained video. SHA-256 hashes are recorded in artifacts/kaggle-subject1/checksums.json.

Video: 1920×1080, 30000/1001 fps, 12,867 frames, duration 429.3289 seconds. All decoded presentation timestamps increase; deltas are 0.033366–0.033367 seconds. Replay uses those timestamps, rather than assuming exactly 30 fps. Video is downscaled with area interpolation to 640×360 for the browser path.

Contact BVP: 64 Hz Empatica wrist PPG. IBI is device-derived PPG intervals, not ECG R–R. No IBI gaps are filled or concatenated.

track.txt prose specifies the second-to-third event markers, while its sample code uses the first pair. The video start marker light is visibly present at zero-based frame 307, PTS 10.243567 s; absent at frame 306. Duration supports pairing to tag 2 (1060.31 s after BVP start) and tag 3 (1476.55 s). Fixed reference-to-video offset: -1050.06643294 s. No pulse-waveform alignment fitting was used.

End marker red-light detection near frame 12792 produces 416.582833 video seconds between markers, vs 416.240000 reference seconds: discrepancy 0.342833 s. Marker-detection uncertainty and clock drift are not disentangled. No clock-rate correction was applied, so absolute beat-time accuracy is not established.

## Experiment

Preselected approximately video seconds 20–140 (3597 frames). Production face extraction and core, plus experiments removing agreement, expanding the skin mask and using the forehead only. Toolbox POS/CHROM are pinned upstream implementations evaluated after OUR region extraction, not the complete Toolbox video-preprocessing pipeline. Offline baselines use full-clip zero-phase filtering. Their 26 overlapping 8-second windows differ from the native streaming readout schedule; they are diagnostic comparisons, not a common-latency leaderboard.

| Method | HR MAE vs device HR (bpm) | Scored windows/readouts | Accepted readout fraction |
|---|---:|---:|---:|
| Toolbox POS | 25.34 | 26 | ungated |
| Toolbox CHROM | 16.84 | 26 | ungated |
| Green + bandpass | 12.80 | 26 | ungated |
| Wide mask Toolbox POS | 18.00 | 26 | ungated |
| production | withheld | 0 | 0.0% |
| without-region-agreement | 10.47 | 21 | 4.8% |
| wide-mask | 6.05 | 52 | 12.0% |
| forehead-only | 10.07 | 29 | 6.7% |

The wider-mask streaming experiment has lower error on its small accepted subset, but only 12% accepted readouts; this is not a usable solution or proof of superiority. Production still accepts no HR and no beats. These experiments are not enabled in the live app.

107 complete supplied reference intervals cover 76.1% of the replay duration. IBI/HRV accuracy is unscored because the reference is sparse, timing precision is unresolved, and production emits no accepted beats. HR comparison uses smoothed device HR, not ECG instantaneous HR.

## Inspect and reproduce

The self-contained numeric inspector is artifacts/kaggle-subject1/report.html; metrics are comparison.json and plot comparison.png. No identifiable video frames are embedded in that report. All downloaded media and derived artifacts stay out of Git and Vercel build.

Run from the repository root with the same Python/Node dependencies as PUBLIC-DATA.md:

```sh
rtk proxy python3 benchmarks/fetch-kaggle.py
rtk proxy python3 benchmarks/audit-video-time.py benchmarks/artifacts/kaggle-subject1/video.MOV benchmarks/artifacts/kaggle-subject1/timestamps.json
rtk proxy python3 benchmarks/prepare-kaggle.py
rtk proxy python3 benchmarks/video-server.py benchmarks/artifacts/kaggle-subject1/video.MOV --port 8988 --width 640 --timestamps benchmarks/artifacts/kaggle-subject1/timestamps.json
# In another terminal:
rtk proxy env BASE_URL=http://127.0.0.1:8988 DATASET=Kaggle-subject1 REPLAY_START_SECONDS=20 REPLAY_SECONDS=120 node benchmarks/extract-video.cjs benchmarks/artifacts/kaggle-subject1/first120-wide.json
rtk proxy node benchmarks/stream-report.js benchmarks/artifacts/kaggle-subject1/first120-wide.json benchmarks/artifacts/kaggle-subject1/stream-wide.json
rtk proxy python3 benchmarks/compare-public.py benchmarks/artifacts/kaggle-subject1 first120-wide.json stream-wide.json
rtk proxy python3 benchmarks/build-report.py benchmarks/artifacts/kaggle-subject1
```

The first two marker observations were inspected manually; the stored timing audit captures the observed endpoint discrepancy. Do not expose the local research server publicly. No production deployment was performed.
