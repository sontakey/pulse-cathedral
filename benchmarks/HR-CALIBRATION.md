# Retrospective HR gate calibration

Frozen before threshold search: tune on UBFC subject1 and MPU recording8 first120 seconds. Evaluate the selected threshold once on UBFC subjects3 and4. These controls have already been inspected; this is not a pristine independent validation set. MPU recording8 has uncertain synchronization/reference quality and is a development constraint, not an independent failure test.

Candidate family: separate lower bounds on raw/filtered spectral concentration and regional agreement; preserve all existing capture gates, startup and discontinuity handling. Search concentration 0.40–0.90 by0.05 and agreement 0–0.80 by0.10. Select highest subject1 time coverage subject to accepted contact-PPG HR MAE <=3 bpm and no additional accepted MPU readouts with device-HR error >10 bpm over baseline. Ties prefer stricter bounds.

Adoption requires >=90% time availability and accepted contact-PPG HR MAE <=3 bpm on BOTH held-out control recordings, plus an independent production-ROI MPU failure replay. The latter is absent, so this experiment alone cannot authorize production adoption. Always report device-HR disagreement alongside contact spectral HR; these references are not interchangeable. No IBI/HRV threshold changes.

Run: `node benchmarks/replay-stages.js benchmarks/artifacts/mpu-sample/first120-wide.json benchmarks/artifacts/mpu-sample/calibration-stages.json`, then `benchmarks/artifacts/toolbox-venv/bin/python benchmarks/calibrate-hr-gate.py`.
