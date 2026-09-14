# Synchronized-control candidate and diagnostic replay — 2026-09-13

The control experiment finds recoverable pulse information that the production quality gates frequently withhold. It does not establish reliable live HR, individual beat timing, or HRV.

## Data admission

Selected UBFC-rPPG subjects **1, 3, and 4 before inference**, using complete recordings. The official [UBFC page](https://sites.google.com/view/ybenezeth/ubfcrppg) describes paired webcam and contact pulse-oximeter acquisition. Its Google Drive video downloads remained quota-limited, including a dataset-1 attempt. PURE and iBVP currently require requests to the authors; no request was sent.

The public mirror is `thachha901/UBFC` on Hugging Face at revision `674723ab9ff04fb7c41507d7dda5bc92b5eeea13`. Each downloaded reference file matches our previously downloaded official reference **byte-for-byte**. Video byte counts and SHA-256 hashes match the mirror's LFS metadata. There is no original-author video checksum, so mirror provenance remains explicit. The data is a control candidate, not a certified reference device.

Raw videos remain at `/Volumes/AcasisData/rPPG-datasets/ubfc-control`. Provenance is saved there and copied into `artifacts/control/protocol.json`. All decoded video frame counts match reference sample counts. All reference values are finite; timestamps never decrease. Subjects 1 and 4 each have one repeated timestamp. There are respectively 1, 4, and 1 input gaps above 150 ms. These events are preserved, not silently repaired.

## Original Toolbox control

Original `UBFCrPPGLoader.read_video`, `read_wave`, preprocessing, POS, CHROM, GREEN, TS-CAN and evaluation functions are used. Only unrelated dataset-package eager imports are bypassed. Video reading and processing source remains unmodified. The published PURE→UBFC TS-CAN configuration is pinned at Toolbox revision `b7500b848f84ad7f86e277b4612563b69f4f88f9`; the checkpoint hash is recorded. Inference runs on MPS instead of the CUDA host wrapper.

| Subject | Input frames | Model-retained frames | Upstream reference PPG HR | TS-CAN HR | Absolute difference |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 1,547 | 1,440 | 109.86 | 109.86 | 0.00 bpm |
| 3 | 1,801 | 1,800 | 88.77 | 92.29 | 3.52 bpm |
| 4 | 1,368 | 1,260 | 112.50 | 112.50 | 0.00 bpm |

These are **whole-recording FFT-bin comparisons** under the official nominal-30-Hz protocol. Zero means the same frequency bin, not exact physiological HR or beat agreement. The three controls are not a reproduction of the entire published benchmark. Partial 180-frame tails are excluded by the upstream configuration.

Local diagnostic scores are separate: fixed 8/15/30-second windows, 4-second step, 8-second edge exclusions, on the supplied timestamp clock. Signals are interpolated to 30 Hz for this offline comparison; the first sample at a duplicate timestamp is retained. No alignment is optimized against predictions. Some short recordings have no eligible 30-second windows. We report agreement with both the supplied smoothed device HR and dominant-frequency HR from contact PPG. Their disagreement is visible, and neither is an ECG beat reference.

The fixed Haar crop on subject 1 includes the lower face and substantial clothing. The viewer exposes it. We did not change that crop to improve the reference run.

## Production-core diagnosis

Actual browser MediaPipe and the shared production pixel sampler extract all input frames. Landmarks update synchronously at 10 Hz; this deterministic replay does not reproduce live asynchronous scheduling. Original timestamp gaps reset the core, and duplicate timestamps are rejected. No production measurement threshold changed.

| Subject | Production time availability | All production candidates: MAE vs contact PPG HR | Diagnostic without agreement: availability | Wider mask, no agreement: availability |
| --- | ---: | ---: | ---: | ---: |
| 1 | 0.0% | 1.16 bpm | 67.8% | 81.0% |
| 3 | 19.7% | 1.32 bpm | 57.1% | 66.3% |
| 4 | 0.0% | 2.35 bpm | 43.7% | 54.8% |

Availability measures elapsed time after the initial eight-second warmup, including subsequent gaps, resets, and withheld periods. Candidate errors cover only moments where analysis actually ran; **they do not count warmup or gaps as successful measurements**. The two diagnostic alternatives remain experimental. Compare production→without-agreement to isolate that gate; compare without-agreement→wide-mask to change region averaging while keeping agreement omitted.

For subject 1, omitting agreement yields 1.17 bpm accepted-estimate error versus contact PPG HR and 2.81 bpm versus device HR. The wider mask yields 0.96 and 2.97 bpm respectively. Subjects 3 and 4 show larger device-HR/reference-waveform disagreements; the report displays both references rather than choosing whichever produces better scores.

This establishes a concrete false-withholding problem on these controls. It does not justify simply disabling agreement in production: the prior MPU stress tests still performed poorly when gates were relaxed. The proposed ≤3 bpm / ≥90% availability milestone has **not** been met. The next algorithm change should calibrate quality acceptance against both controls and failure cases, with held-out recordings and explicit false-acceptance reporting.

## What was implemented

- Optional `RPPGProcessor({captureStages:true})` captures numerical intermediate arrays for local replay. Default operation retains no extra stage arrays. Additive numerical diagnostics expose candidate HR, raw/filtered concentration, agreement multiplier and threshold. Accepted HR/IBI/HRV behavior is unchanged.
- The replay shows source frames with tracked sampling boxes and the fixed Toolbox crop, raw RGB changes, brightness, motion, timestamp gaps, raw POS, filtered output, reference PPG, model waveforms, and withholding reasons.
- Existing diagnostic JSON can be opened locally. A dedicated module Worker replays the DOM-independent core without uploading data or blocking the UI. Numeric logs cannot reconstruct face images, rerun tracking, or supply spatial input to TS-CAN. No accuracy score is fabricated when a reference is absent.
- Node and the Worker share `replay-engine.js`. The live camera pipeline has not been moved into a Worker or released as a separate package.

## Run and inspect

```sh
rtk proxy python3 benchmarks/fetch-ubfc-control.py
rtk proxy benchmarks/artifacts/toolbox-venv/bin/python benchmarks/run-control-toolbox.py
rtk proxy python3 benchmarks/run-control-browser.py
rtk proxy benchmarks/artifacts/toolbox-venv/bin/python benchmarks/score-control-stages.py
rtk proxy python3 benchmarks/diagnostic-server.py
```

Open `http://127.0.0.1:8991/`. The server binds only to localhost and serves explicit control-frame routes. Raw datasets and generated artifacts remain outside the static Vercel build. The Toolbox runner reuses completed outputs; remove a control's generated outputs before changing its frozen configuration and rerunning.

Files under `artifacts/control/<subject>` include `session.json`, `stages.json`, `toolbox.json`, `waves.json`, `stage-scores.json`, timestamp arrays, and numerical source outputs. Recompute derived replay only with `node benchmarks/replay-stages.js INPUT OUTPUT`; no video is needed once RGB sampling has been saved.

## Verification

All repository tests pass. New tests prove optional instrumentation preserves production outputs exactly and clears on gaps; replay tests cover duplicate timestamps, flat-signal withholding and elapsed-time coverage. Browser checks pass all controls, processing modes, 8/15/30-second views, source overlays, playback, mobile layout, and import of Anton's actual `01-39-12.659Z` diagnostic JSON. The import generated no POST requests and no browser errors. A final visual review covered control and personal-log views. No production deployment, model training, or clinical validation was performed.
