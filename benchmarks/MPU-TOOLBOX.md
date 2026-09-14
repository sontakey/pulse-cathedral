# MPU-rPPG frozen Toolbox benchmark — 2026-09-13

**No tested method establishes reliable HR on this benchmark.** TS-CAN's earlier 6.32 bpm result on one Kaggle clip does not generalize to these recordings. All results below measure disagreement with the supplied, smoothed device HR, not verified ECG accuracy.

## Scope and protocol

Five local recordings, three preselected two-minute clips each: 30 minutes of sampled video from approximately 65 minutes available. This is not a full-recording evaluation. Recording 8 repeats our existing sample and is excluded from the primary aggregate. Recording numbers are not verified participant identities.

| Recording | Clip start times (seconds) |
| --- | --- |
| 10 | 20, 227, 434 |
| 5 | 20, 390, 760 |
| 8 — repeat control | 20, 311, 602 |
| 9 | 20, 334, 648 |
| root-hd | 20, 396, 773 |

The plan was saved before inference. All decoded PTS are finite and strictly increasing; complete decoded frame counts match continuous CSV Count rows for all five recordings, including 54,824 frames in the MKV. SHA-256 hashes and timestamp arrays are saved. This establishes structural pairing, not physiological synchronization or original-provider checksum verification.

Use nearest source frames on a 30 Hz grid, without selecting duplicate frame indices. Preserve the original timestamps. The fixed upstream configuration is `PURE_UBFC-rPPG_TSCAN_BASIC.yaml`: static Haar face detection on the first selected frame, 1.5× box, 72×72 resize, difference and appearance normalization, 180-frame chunks, PURE pretrained TS-CAN weights. Original upstream preprocessing and method/model functions remain unmodified; a custom dataset adapter handles the local files. MPS inference replaces the CUDA host wrapper. Normalization and filtering are offline per two-minute clip, not causal browser processing.

Upstream commit: `b7500b848f84ad7f86e277b4612563b69f4f88f9`. Environment and runner hash are saved in `artifacts/mpu-toolbox/environment.json`; full configuration and checkpoint hash are in `protocol.json`. Upstream source is governed by its Responsible AI source-code license; this benchmark does not change that license.

Each method receives the same crops. Evaluate 26 overlapping 8-second windows per clip, spaced four seconds apart, with eight seconds excluded at either clip boundary. A common Hann periodogram scorer searches 0.7–3 Hz. Compare with the median supplied device HR. Outputs must be finite/nonflat; reference HR must remain finite and 30–220 bpm throughout the window. No quality threshold was tuned, and no bad face crop was discarded.

## Primary result: four additional recordings

312 planned windows per method; 310 scored. Two windows at 404 and 408 seconds in root-hd have invalid reference HR samples and are excluded identically for all methods. Every method produced a numeric estimate on every planned window; this is output availability, not reliable-measurement coverage.

| Method | MAE (bpm) | RMSE (bpm) | Within ±5 bpm |
| --- | ---: | ---: | ---: |
| POS | 17.48 | 21.87 | 15.8% |
| CHROM | 17.55 | 22.88 | 18.1% |
| Green + bandpass | 20.84 | 24.56 | 12.9% |
| Pretrained TS-CAN | 18.17 | 22.09 | 16.8% |

| Recording | POS MAE | CHROM MAE | Green MAE | TS-CAN MAE |
| --- | ---: | ---: | ---: | ---: |
| 10 | 17.69 | 21.84 | 16.92 | 19.60 |
| 5 | 16.05 | 13.57 | 29.69 | 20.85 |
| 9 | 22.78 | 18.75 | 19.05 | 17.86 |
| root-hd | 13.30 | 15.99 | 17.61 | 14.26 |
| 8 — repeat control | 25.33 | 11.04 | 17.06 | 19.83 |

Overlapping windows are correlated; these counts are not independent statistical samples. The small difference between POS and CHROM does not establish a meaningful winner.

## Failure and reference audit

- Face detection fails at the beginning of recording 8's early clip; the original Toolbox fallback is retained and identified in the report. All other first-frame detections succeed. Selected crop contact sheets show that detection success alone does not establish a usable pulse signal.
- Screen illumination, motion, and downward gaze are visible in the source review. These are plausible contributors, not experimentally isolated causes.
- The HD clips have approximately 34% adjacent identical mean-RGB samples even after sampling at 30 Hz. Together with the original three-frame change pattern, this supports concern about repeated exposures. It does not certify an effective exposure frequency.
- A separate exploratory reference consistency check compares dominant-frequency HR from the supplied PPG with supplied device HR. Recording 10 differs by 39.51–55.65 bpm across the three segments. This can reflect reference artifacts, harmonics or timing problems; it does not by itself prove the HR readout is wrong. The report exposes this discrepancy rather than substituting a different reference after seeing results.
- No IBI/HRV score is issued. CSV files lack acquisition timestamps and verified beat annotations. No fine tuning, browser model integration, or deployment was performed.

The useful next step is to isolate acquisition/cropping/model failures against a trusted synchronized reference. Keep Toolbox as the reproducible comparator; these results do not justify shipping this pretrained checkpoint or training against every supplied PPG trace without reference review.

## Inspect and reproduce

Local interactive report: `artifacts/mpu-toolbox/report.html`. It contains only numeric traces and readouts, with recording/segment selectors and 10/20/60-second waveform views. Exportable figure: `hr-comparison.png`. Detailed scores: `results.json`; independent verification and reference diagnostics: `verification.json`. Source media stays on the external drive. Generated artifacts are ignored by Git and excluded from the Vercel build.

From the repository root:

```sh
rtk proxy benchmarks/artifacts/toolbox-venv/bin/python benchmarks/run-mpu-toolbox.py
rtk proxy benchmarks/artifacts/toolbox-venv/bin/python benchmarks/verify-mpu-benchmark.py
rtk proxy benchmarks/artifacts/toolbox-venv/bin/python benchmarks/build-mpu-report.py
# With Playwright available on NODE_PATH:
rtk proxy node benchmarks/check-mpu-report.cjs
```

The independent verifier reconstructs FFT estimates from saved waveforms, checks known-frequency signals and flat-signal rejection, recomputes aggregate errors, and checks all 15 clips/390 windows per method. Browser checks exercise every segment selector and waveform slider, desktop/mobile layout, and JavaScript errors. These verify the benchmark software and report, not physiological accuracy.
