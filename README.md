# Pulse Cathedral — Signal Lab

A local browser workspace for inspecting camera-derived PPG and evaluating a transparent POS baseline. This revision is a measurement workbench; it is not a validated HRV device and does not implement HRVCam or a neural model.

## Run

Node 20+ is needed for tests/benchmarks; Python 3 serves the static app. From this directory:

```sh
rtk npm start
```

Open http://127.0.0.1:8765. Choose **Start camera** to measure or **Try synthetic signal** to inspect the interface without accessing a camera. The synthetic source stays prominently labeled. Camera access requires localhost/HTTPS and a browser supporting `requestVideoFrameCallback`.

The app fetches pinned MediaPipe assets from jsDelivr and fonts from Google. Three.js loads only when the optional cathedral is enabled. RGB extraction, analysis and recordings stay in the browser; the app contains no video-upload path. Recording stores RGB means, not face images/video.

## Inspect and record

- PPG trace: last 10 seconds, normalized arbitrary amplitude, actual time axis, accepted/rejected peak markers. Confirmation is approximately 2–2.3 seconds behind the camera. This delay is not pulse arrival time or ECG alignment.
- Freeze holds the trace and its markers; numeric readouts continue. Scale changes affect only the display.
- Readouts: spectral HR, latest accepted pulse interval, RMSSD/SDNN over a 60-second window, heuristic quality, accepted interval duration / 60 seconds, observed FPS and region agreement.
- HRV requires at least 90% accepted interval duration in the window plus enough adjacent pairs. It is withheld during warmup, gaps and low quality. PRV denotes pulse variability; ECG equivalence is unestablished.
- Start a recording after selecting the source. Recording resets the processor so no pre-recording beat enters the export. Keep a clean session for at least 75–90 seconds; longer paired sessions are preferable.
- Add sync markers to annotate externally observed events. They do not establish hardware synchronization.
- Stop recording, then export JSON. Export includes timestamped region RGB, waveform, beat events, rejected frames, quality, readouts, configuration and markers. A 36,000-frame limit bounds memory. Download before starting another recording or closing the page.
- The optional animated cathedral is off by default to reduce changing screen illumination. Toggle events are recorded as markers. Breathing guidance and the unvalidated coherence number are absent from the measurement view.

## Processing contract

`js/measurement.js` is the shared browser/replay processor. Input timestamps are required in seconds; duplicate/nonmonotonic inputs are ignored. Actual video `mediaTime` drives sampling, independently of display refresh. Frame gaps over 150 ms, stale/missing landmarks, excessive motion, lighting steps and bad exposure break the signal chain. No interval crosses a segment boundary.

The processor interpolates timestamped RGB to a fixed 60 Hz grid (this does not create 60 Hz camera information), performs temporally normalized POS with mean removal and overlap-add, and applies a 0.7 Hz high-pass / 4 Hz low-pass Butterworth cascade with coefficients derived from the processing rate. These are individual section cutoff frequencies, not an assertion that the combined response is exactly −3 dB at both edges. It discards three seconds of left-edge filter transient and confirms peaks with two seconds of bounded lookahead. A local ±83 ms quadratic fit gives subframe peak timing. There is no interval regularization to force a desired HRV.

Quality combines spectral concentration before and after filtering with agreement among three facial regions. It is a heuristic, not a probability of correctness: common periodic motion/light can still resemble pulse. The contracted landmark boxes are not a full skin-segmentation model. Stable exposure and lighting remain necessary. The current implementation runs analysis at approximately 4 Hz on the main thread; low-powered devices require FPS/drop inspection and may warrant moving analysis to a Worker.

## Tests and synthetic benchmark

```sh
rtk npm test
rtk npm run benchmark
```

The benchmark writes `benchmarks/latest.json` and includes 30/60 fps, low/high/off-grid HR, variable intervals, timestamp jitter, isolated dropped frames, face loss, broadband noise and flat input. All fixtures use fixed seeds. HR compares matching analysis windows. IBI comparisons require consecutive matched beats in both sequences and the same segment; missing beats are counted rather than imputed. The regression beat-matching tolerance is 250 ms with a fixed zero clock offset; this tolerance is not the achieved timing accuracy. HRV windows overlap, so their count is not an independent participant/sample count.

`pass` describes core regression checks (HR error <3 bpm, matched IBI error <35 ms, F1 >0.90; no HR for negative fixtures). `capabilities.hrv` separately flags an exploratory ≤10 ms RMSSD/SDNN summary-error target. No combined pass hides that flag. Warmup, confirmation delay and gaps count against full-session interval coverage; beat F1 additionally reports its explicit 8-second-to-duration-minus-2-second scoring interval. These results are software checks, not webcam accuracy measurements.

For browser checks, install the locked dev dependency and have Chrome installed:

```sh
rtk npm ci
rtk npm run test:browser
```

Keep the local server running. The test uses headless Chrome with synthetic input and a fake camera, checks desktop/mobile layout, freeze, export and camera cleanup, and saves local screenshots/recordings under ignored `benchmarks/artifacts/`. It never opens your real camera. Older source-string assertions for the replaced HUD/automatic breathing/peak-count wiring were removed; retained component tests and new functional pipeline/browser tests cover the current behavior.

## Replay a recording against a reference

```sh
rtk proxy node benchmarks/replay.js session.json reference.json 0 report.json
```

The explicit third argument is a fixed clock offset in seconds, added to reference timestamps. Determine it from independent synchronization or a separate calibration interval, never by fitting the evaluation beat errors. No time warping is applied. Reference format:

```json
{"kind":"ECG R peaks","beats":[0.213,1.042,1.884,2.710]}
```

Use real, increasing beat timestamps relative to the reference recording origin; the numbers above are an illustrative schema only. Retain reference provenance and annotate artifacts/ectopy externally. This scorer accepts a timestamp list, not raw ECG or vendor-specific files, and does not classify normal/ectopic beats. Camera pulse intervals and ECG intervals may differ physiologically. Supplying a pulse-oximeter or synthetic reference must be labeled accordingly.

Replay outputs beat precision/recall/F1, adjacent IBI MAE/median/p95, interval coverage, and matched-window HR/RMSSD/SDNN error, bias and descriptive agreement limits. Its primary beat score includes warmup and the unconfirmed tail. Review coverage and false/missed beats alongside error on matched intervals. Raw-video datasets need an extraction adapter; no public dataset or learned model was run in this revision.

## Next empirical benchmark

Record synchronized ECG and preferably contact PPG alongside the webcam. Separate participants/sessions/devices between tuning and evaluation; stratify by skin tone, lighting, movement and camera FPS. Compare scene on/off at a fixed display brightness. Preserve failed sessions, reference artifacts and exclusions. Evaluate HR, individual IBI, RMSSD, SDNN, coverage and latency independently. POS/HRVCam and Seq-rPPG remain comparison candidates, not implemented or reproduced results.

## Diagnostic sharing without video

**Download diagnostics** is available even if camera initialization fails. While capture runs, a local rolling buffer retains approximately the last 120 seconds of numeric region RGB, quality, timing, waveform and beat outputs, plus up to 200 status/error events. Camera device IDs, images, landmarks and audio are excluded. Nothing uploads automatically. Stop and download promptly after a problem; starting another source replaces the buffer. Attach the JSON in chat for investigation.

Replay with `node benchmarks/replay.js pulse-diagnostics.json` to reproduce processing and report frame gaps, invalid-frame reasons, FPS and errors. With no independent reference this can identify software and signal-quality issues, but cannot establish physiological accuracy. Truncated buffers require fresh warmup; pixel-level tracking and optical artifacts cannot be fully diagnosed from RGB means alone.

## Vercel deployment

`vercel.json` builds the static site into `dist` with no dependency installation. The build copies only HTML/CSS/JavaScript and the synthetic benchmark report; recordings, diagnostic files, tests and environment files are excluded.
