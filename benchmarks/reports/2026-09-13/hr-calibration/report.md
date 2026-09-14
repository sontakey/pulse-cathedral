# HR acceptance calibration

Selected experimental policy: {'concentration': 0.45, 'agreement': 0.4}. **Not adopted.**

| Recording | Gate | Availability | Accepted readouts | MAE/contact bpm | MAE/device bpm | Device errors >10 bpm |
|---|---|---:|---:|---:|---:|---:|
| subject1 | baseline | 0.0% | 0 | N/A | N/A | 0 |
| subject1 | candidate | 81.0% | 136 | 1.16 | 2.86 | 0 |
| subject3 | baseline | 19.7% | 39 | 1.12 | 16.17 | 36 |
| subject3 | candidate | 65.8% | 131 | 1.21 | 10.86 | 69 |
| subject4 | baseline | 0.0% | 0 | N/A | N/A | 0 |
| subject4 | candidate | 72.2% | 104 | 1.41 | 9.42 | 44 |
| mpu8-development | baseline | 0.0% | 0 | N/A | N/A | 0 |
| mpu8-development | candidate | 0.0% | 0 | N/A | N/A | 0 |

Held-out control criteria passed: False. Independent failure validation is still absent.

Retrospective controls; MPU8 is tuning only and its reference synchronization is unverified. No beat validation or production changes.

Availability includes all elapsed time after initial eight-second warmup, including later resets. Error is readout-weighted on actual causal HR windows. Adjacent windows overlap and are not independent observations. Contact HR is a spectral estimate from the contact waveform, not beat-timing ground truth.
