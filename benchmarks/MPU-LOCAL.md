# Local MPU-rPPG archive admission

Inspected 2026-09-13. Source remains on the external drive:
`/Volumes/AcasisData/rPPG-datasets/29377835`.
The accompanying ZIP contains five video/CSV pairs, not evidence of the full research cohort. Folder numbers are recording identifiers until subject metadata establishes otherwise.

| Recording | Resolution | Duration (seconds) | Reference rows |
| --- | --- | ---: | ---: |
| 5 | 640 × 480 | 900.08 | 54,005 |
| 8 | 640 × 480 | 742.47 | 44,548 |
| 9 | 640 × 480 | 788.53 | 47,312 |
| 10 | 640 × 480 | 574.93 | 34,496 |
| root Output.mkv | 1280 × 720 | 913.73 | 54,824 |

All containers report 60 fps. The subsequent full timestamp decode confirmed that all five frame counts match their paired CSV rows, including 54,824 frames in the MKV. CSV columns are Count, PPG, HR, SPO2; they do not expose acquisition timestamps or subject identities.

Recording 8 is byte-identical to our previous official sample: MD5 f179978e6c2d3c10b65920a551977497. It is not independent new evaluation data.

An exploratory first-601-frame audit, resized to 160 × 120 for comparison, found a pronounced three-frame change pattern in every recording. The MKV median absolute pixel change by phase was 0, 1.2724, 0. This suggests repeated exposures despite nominal 60 fps; it does not establish the actual exposure rate. Do not claim verified 60 Hz beat timing or score IBI/HRV without further timing/reference validation.

Machine-readable paths, metadata, CSV counts and freshness summaries are saved locally in `artifacts/mpu-local-inventory.json`. No source media was copied into the repository or deployed.

Completed the frozen Toolbox comparison on three prespecified segments per recording; see [MPU-TOOLBOX.md](MPU-TOOLBOX.md). Full timestamps, structural pairing and source SHA-256 hashes were recorded; original-provider checksums and physiological synchronization remain unverified. Recording 8 remains a repeat development fixture. Do not claim subject-held-out evaluation until subject identities and overlap are documented.
