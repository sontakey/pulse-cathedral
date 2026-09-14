# Pulse Cathedral handoff — 2026-09-13

## Saved state

Browser webcam rPPG project, benchmark runners, capture diagnostics and local replay viewer are saved on branch `codex/measurement-benchmark`. This checkpoint is not a production deployment. The current HR/IBI/HRV core has not adopted the experimental calibration thresholds.

## Latest finding

The retrospective HR threshold search selected separate minimum spectral concentration 0.45 and region agreement 0.40. Availability improved from 0% to81% on UBFC subject1 (tuning), and from19.7%/0% to65.8%/72.2% on subjects3/4 (validation). Accepted HR errors versus contact PPG dominant frequency were1.16/1.21/1.41bpm. MPU recording8 development replay remained fully rejected.

This misses the90% availability target. Device-HR disagreement is substantial on subjects3/4. These recordings were previously inspected, so validation is retrospective, not pristine independent evidence. No independently held-out MPU production-ROI failure validation has been completed. Average HR results do not validate beat timing or HRV.

[Saved reports and manifest](benchmarks/reports/2026-09-13/README.md)

## Resume

1. Read `benchmarks/HR-CALIBRATION.md`, `CONTROL-REPLAY.md`, `MPU-LOCAL.md` and `MPU-TOOLBOX.md` under benchmarks.
2. Freeze the selected candidate before extracting additional production-ROI MPU sessions. Existing 15-clip Toolbox outputs use a different crop pipeline and cannot substitute for these sessions.
3. Validate candidate false acceptance on additional recordings, with baseline comparisons and reference timing/quality audits. Recording IDs do not establish distinct participants.
4. Investigate coverage lost to capture gaps, warmup/reset and region agreement. Preserve acquisition timestamps; an interpolated60Hz analysis grid is not60fps camera capture.
5. Only adopt an HR-only acceptance change if the predeclared criteria pass. Keep beat/IBI/HRV gates separate and unchanged until paired beat references validate them.

## Local commands and data

- `npm ci`, `npm test`, `npm run build`.
- `python3 benchmarks/diagnostic-server.py` serves local replay at http://127.0.0.1:8991/ when local control artifacts exist.
- Raw data: `/Volumes/AcasisData/rPPG-datasets/`; UBFC controls in `ubfc-control`, MPU in `29377835`.
- Generated sessions and scientific environment: ignored `benchmarks/artifacts/`; Python executable `benchmarks/artifacts/toolbox-venv/bin/python` on this machine.
- `node benchmarks/replay-stages.js benchmarks/artifacts/mpu-sample/first120-wide.json benchmarks/artifacts/mpu-sample/calibration-stages.json`
- `benchmarks/artifacts/toolbox-venv/bin/python benchmarks/calibrate-hr-gate.py`
- Dataset fetch/extraction/model runner scripts and pinned provenance are documented in the benchmark markdown files. A fresh clone includes reports but must reacquire datasets and regenerate local artifacts to rerun the full pipeline.

The numeric diagnostic viewer can inspect exported camera logs without video uploads. Personal logs are deliberately not part of this Git checkpoint.
