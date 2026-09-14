# Public-video development benchmark — 2026-09-13

The first real-video comparison reproduces the failure. It does not establish reliable HR, IBI or HRV.

## Data actually obtained

Five official UBFC dataset-2 videos (subjects 1, 3, 4, 38, 49) returned Google Drive quota-exceeded HTML. Their reference text files downloaded, but no UBFC video was admitted to the benchmark.

Fallback: official [MPU-rPPG representative sample](https://doi.org/10.6084/m9.figshare.29377835), video file ID 55553417 and CSV ID 55553414. Both checksums match the provider. Video: 640×480, nominal 60 fps, 44,548 frames. CSV: 44,548 continuous Count rows, PPG, HR, SPO2. File pairing is inferred from adjacent official IDs and equal counts; there is no recording ID or raw timestamp in this CSV. The first 120 seconds were selected before examining results.

The paper describes higher-resolution, timestamp-aligned acquisition. The downloaded sample does not expose that timing evidence. Its first 600 decoded frames show a strong three-frame change pattern (median pixel change by phase: 0.408, 0.041, 0.014). This suggests fewer fresh camera exposures than the container rate, but does not measure the exposure rate. **Do not treat this sample as verified 60 Hz beat ground truth.**

## Methods and results

Production FaceDetector and the newly shared `js/capture-sample.js` extract exactly the same region means and validity checks used by the app. Decode source frames with OpenCV, transfer lossless PNG to browser canvas, sample at 30 Hz, update landmarks synchronously at 10 Hz. This is deterministic extraction, not a reproduction of asynchronous live camera scheduling.

Reference POS and CHROM are loaded from the pinned upstream rPPG-Toolbox revision in public-data-manifest.json. Their algorithms are unchanged. Compatibility: np.mat aliases np.asmatrix; original utils functions load without unused skimage/sklearn imports. Each RGB mean becomes a 1×1 RGB frame for the upstream method. Baselines use the whole clip and zero-phase filtering; production retains its streaming warmup, reset and quality gates.

| Method | HR MAE vs device HR | Scored windows/readouts |
|---|---:|---:|
| Toolbox POS | 16.54 bpm | 26 |
| Toolbox CHROM | 18.61 bpm | 26 |
| Green + bandpass | 33.14 bpm | 26 |
| Wide mask Toolbox POS | 17.71 bpm | 26 |
| production | withheld | 0 |
| without-region-agreement | 21.57 bpm | 30 |
| wide-mask | 27.86 bpm | 14 |

Offline methods: 26 overlapping 8-second windows spaced 4 seconds apart. Streaming metrics: accepted native readouts only, with acceptance fraction separately recorded. These are diagnostic comparisons, not identical latency or coverage protocols. Device HR is smoothed; it is not ECG instantaneous HR.

Removing agreement leaves 30 accepted readouts of 631 eligible outputs, averaging 21.57 bpm below reference. A full-face skin mask excluding eyes/eyebrows/mouth also fails to improve extraction. Neither experiment is enabled in production. The measured failure cannot be fixed by simply loosening agreement or increasing pixel area on this clip.

IBI/HRV accuracy is deliberately unscored: reference peaks are automatically detected and unreviewed, reference timing is unverified, and production produces no accepted beats. `waveforms.json` labels automatic reference peaks as exploratory.

## Inspect

Local output: `benchmarks/artifacts/mpu-sample/report.html` (self-contained, offline interactive numeric waveform viewer), `comparison.png`, `comparison.json`, `waveforms.json`, `stream-wide.json`, `timing-audit.json`, and numeric replay inputs. No face images are embedded in the report. Artifacts and source videos are excluded from Git and the Vercel static build.

## Reproduce

Run from repository root. Python needs numpy, scipy, opencv-python and matplotlib; Node needs Playwright and installed Chrome. This run used Python 3.14, NumPy 2.5.2, SciPy 1.18.1 and the existing system OpenCV/Matplotlib. No neural model or training was run.

```sh
rtk proxy python3 benchmarks/fetch-public.py
rtk proxy python3 benchmarks/video-server.py benchmarks/artifacts/mpu-sample/video.mp4
# In another terminal, while the local frame server runs:
rtk proxy node benchmarks/extract-video.cjs benchmarks/artifacts/mpu-sample/first120-wide.json
rtk proxy node benchmarks/stream-report.js benchmarks/artifacts/mpu-sample/first120-wide.json benchmarks/artifacts/mpu-sample/stream-wide.json
rtk proxy python3 benchmarks/compare-public.py benchmarks/artifacts/mpu-sample first120-wide.json stream-wide.json
rtk proxy python3 benchmarks/build-report.py benchmarks/artifacts/mpu-sample
```

The server binds only 127.0.0.1:8987. It serves the local repository; do not expose it publicly. Raw timing audit is presently a saved development artifact rather than a required benchmark input. Stop the server when finished.

## Next admission requirements

Obtain a known-good raw-video/reference pair with documented timing (UBFC when quota permits, or authorized PURE/RLAP). Admit data by checksum, timestamp integrity, frame freshness and reference quality before tuning. Separate subjects for tuning and testing, and reserve a different dataset for final evaluation. This MPU sample remains a development failure fixture, not a fine-tuning label source or independent accuracy test.

Validation of shared extraction refactor: 395 tests pass; browser smoke passes desktop/mobile, recording/export, trace freeze, stop/reset and fake-camera lifecycle. These are software checks, not physiological accuracy. No production deployment was made for this benchmark.
