# FacePhys replacement

The static build now opens the pinned official FacePhys browser pipeline at `/facephys/`; previous Signal Lab is preserved at `/legacy.html`. Source index.html remains the legacy test fixture. This is an application-level replacement, not yet a FacePhys adapter inside measurement.js.

Upstream: https://github.com/KegangWangCCNU/FacePhys-Demo at0007a97565872f5845824802eccec0258305c98d. Model release: https://github.com/KegangWangCCNU/FacePhys-Release. License and per-file upstream hashes are preserved under facephys/. Model weights, initial states, inference/PSD/plot Workers are included. Runtime assets still load from pinned upstream CDN URLs; first load requires network access.

All inference remains in the browser. Camera start now asks explicit consent. No camera or physiological uploads were added. Upstream export is a local ZIP download. Service-worker registration is disabled to avoid stale runtime/model versions.

The upstream crop, state mapping, normalization, signal/HR estimation, and timing behavior are preserved. This retains the demo behavior the user preferred, but does not establish accuracy. Existing POS/Toolbox benchmark results do not describe FacePhys; FacePhys still needs its own paired-reference benchmark. In particular upstream HRV should not be interpreted as independently validated IBI/HRV. RGB-mean diagnostic logs cannot reconstruct the36x36 spatial input used by this model.

## Experimental metrics extension

`facephys/metrics.js` now supplies peak BPM, latest IBI(ms), sample SDNN(ms), RMSSD(ms), pNN50(percent), LF/HF and an interval-modulation respiration estimate(breaths/min). It is a browser-native estimator, not a port validated for numerical parity with HeartPy. Existing FFT HR/SQI/inference latency are retained. The local ZIP includes a `metrics.json` snapshot with an `hrv` dictionary.

Uses video.currentTime carried through the inference Worker, requiring SQI>0.5 and a recent face. Gaps>150ms, low quality, or rejected intervals clear the continuous interval window. Minimum60seconds for time-domain variability and120seconds for spectral estimates. LF/HF uses4Hz interpolated accepted intervals, Hann periodogram and bands0.04–0.15/0.15–0.4Hz. Breathing rate is the largest high-frequency interval modulation peak, not a direct respiration measurement. These gates are provisional and unvalidated; frequent resets may leave metrics unavailable.

Known limitations: frame-resolution peak timing, simple peak/outlier heuristics, upstream model state/timing unchanged, no ECG/respiration-reference validation. Synthetic arithmetic/reset tests and browser initialization verify implementation only.

## Default release decision

The custom metrics extension is OFF by default; enable only with `?experimentalMetrics=1`. The user preferred FacePhys's released measurement experience. Do not describe the custom IBI/HRV extension as working or validated.
