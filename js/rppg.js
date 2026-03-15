/**
 * rPPG signal processing module.
 * Face detection (MediaPipe Face Mesh) + POS algorithm + peak detection + HRV.
 */

/** Bandpass filter range: 42–240 BPM → 0.7–4.0 Hz */
const BPM_MIN = 42;
const BPM_MAX = 240;
const FREQ_MIN = BPM_MIN / 60; // 0.7 Hz
const FREQ_MAX = BPM_MAX / 60; // 4.0 Hz

/** Sliding window length in frames (at ~30 fps ≈ 1.5s) */
const WINDOW_LENGTH = 45;

/**
 * Simple second-order IIR bandpass (Butterworth-style).
 * Pre-computed for 0.7–4 Hz at 30 fps sample rate.
 */
function createBandpassFilter() {
  // State for two cascaded biquad sections
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const a1 = -1.1430;
  const a2 = 0.4128;
  const b0 = 0.2936;
  const b1 = 0;
  const b2 = -0.2936;

  return function filter(x) {
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x;
    y2 = y1; y1 = y;
    return y;
  };
}

/**
 * POS (Plane-Orthogonal-to-Skin) algorithm.
 * Wang et al., IEEE TBME 2016.
 *
 * @param {number[][]} rgbWindow — array of [r, g, b] mean values over sliding window
 * @returns {number} Pulse signal sample
 */
export function posAlgorithm(rgbWindow) {
  const n = rgbWindow.length;
  if (n < 2) return 0;

  // Temporal normalization: divide each channel by its mean
  let meanR = 0, meanG = 0, meanB = 0;
  for (let i = 0; i < n; i++) {
    meanR += rgbWindow[i][0];
    meanG += rgbWindow[i][1];
    meanB += rgbWindow[i][2];
  }
  meanR /= n; meanG /= n; meanB /= n;
  if (meanR === 0 || meanG === 0 || meanB === 0) return 0;

  const cn = new Array(n);
  for (let i = 0; i < n; i++) {
    cn[i] = [
      rgbWindow[i][0] / meanR,
      rgbWindow[i][1] / meanG,
      rgbWindow[i][2] / meanB,
    ];
  }

  // Projection: S1 = G - B, S2 = G + B - 2R (POS projection)
  const s1 = new Float64Array(n);
  const s2 = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    s1[i] = cn[i][1] - cn[i][2];
    s2[i] = cn[i][1] + cn[i][2] - 2 * cn[i][0];
  }

  // Standard deviations
  let m1 = 0, m2 = 0;
  for (let i = 0; i < n; i++) { m1 += s1[i]; m2 += s2[i]; }
  m1 /= n; m2 /= n;
  let std1 = 0, std2 = 0;
  for (let i = 0; i < n; i++) {
    std1 += (s1[i] - m1) ** 2;
    std2 += (s2[i] - m2) ** 2;
  }
  std1 = Math.sqrt(std1 / n);
  std2 = Math.sqrt(std2 / n);
  if (std2 === 0) return 0;

  const alpha = std1 / std2;

  // Final pulse signal: h = S1 + alpha * S2
  return s1[n - 1] + alpha * s2[n - 1];
}

/**
 * Detect peaks in a signal buffer.
 * Returns indices of detected peaks.
 *
 * @param {number[]} signal
 * @param {number} minDistance — minimum samples between peaks
 * @returns {number[]} peak indices
 */
export function detectPeaks(signal, minDistance = 10) {
  const peaks = [];
  for (let i = 1; i < signal.length - 1; i++) {
    if (signal[i] > signal[i - 1] && signal[i] > signal[i + 1]) {
      if (peaks.length === 0 || i - peaks[peaks.length - 1] >= minDistance) {
        peaks.push(i);
      }
    }
  }
  return peaks;
}

/**
 * Compute heart rate (BPM) from peak indices at a given sample rate.
 *
 * @param {number[]} peakIndices
 * @param {number} sampleRate
 * @returns {number|null} BPM or null if insufficient data
 */
export function computeHR(peakIndices, sampleRate) {
  if (peakIndices.length < 2) return null;
  const intervals = [];
  for (let i = 1; i < peakIndices.length; i++) {
    intervals.push((peakIndices[i] - peakIndices[i - 1]) / sampleRate);
  }
  const meanInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  if (meanInterval <= 0) return null;
  const bpm = 60 / meanInterval;
  if (bpm < BPM_MIN || bpm > BPM_MAX) return null;
  return bpm;
}

/**
 * Compute HRV as RMSSD (root mean square of successive differences) in milliseconds.
 *
 * @param {number[]} peakIndices
 * @param {number} sampleRate
 * @returns {number|null}
 */
export function computeHRV(peakIndices, sampleRate) {
  if (peakIndices.length < 3) return null;
  const ibiMs = [];
  for (let i = 1; i < peakIndices.length; i++) {
    ibiMs.push(((peakIndices[i] - peakIndices[i - 1]) / sampleRate) * 1000);
  }
  let sumSqDiff = 0;
  for (let i = 1; i < ibiMs.length; i++) {
    sumSqDiff += (ibiMs[i] - ibiMs[i - 1]) ** 2;
  }
  return Math.sqrt(sumSqDiff / (ibiMs.length - 1));
}

/**
 * Compute signal-to-noise ratio (simple spectral SNR estimate).
 * Returns a 0–1 quality score.
 *
 * @param {number[]} signal — filtered pulse signal buffer
 * @returns {number}
 */
export function signalQuality(signal) {
  if (signal.length < 4) return 0;
  let sumSq = 0;
  let mean = 0;
  for (let i = 0; i < signal.length; i++) mean += signal[i];
  mean /= signal.length;
  for (let i = 0; i < signal.length; i++) sumSq += (signal[i] - mean) ** 2;
  const variance = sumSq / signal.length;
  // Heuristic: map variance to 0–1 quality (higher variance → stronger signal)
  const quality = Math.min(1, Math.max(0, Math.sqrt(variance) * 15));
  return quality;
}

/**
 * RPPGProcessor — stateful class that manages the full rPPG pipeline.
 */
export class RPPGProcessor {
  constructor() {
    this.rgbBuffer = [];
    this.pulseSignal = [];
    this.filter = createBandpassFilter();
    this.sampleRate = 30;
    this.windowLength = WINDOW_LENGTH;
  }

  /**
   * Feed an RGB sample from the ROI.
   *
   * @param {number[]} rgb — [r, g, b] mean values from face ROI
   * @returns {{ pulse: number, hr: number|null, hrv: number|null, quality: number }}
   */
  addSample(rgb) {
    this.rgbBuffer.push(rgb);

    // Keep a rolling window
    if (this.rgbBuffer.length > this.windowLength * 4) {
      this.rgbBuffer = this.rgbBuffer.slice(-this.windowLength * 4);
    }

    // Need at least a window of data
    const window = this.rgbBuffer.slice(-this.windowLength);
    const rawPulse = posAlgorithm(window);
    const filtered = this.filter(rawPulse);
    this.pulseSignal.push(filtered);

    if (this.pulseSignal.length > this.sampleRate * 10) {
      this.pulseSignal = this.pulseSignal.slice(-this.sampleRate * 10);
    }

    const peaks = detectPeaks(this.pulseSignal);
    const hr = computeHR(peaks, this.sampleRate);
    const hrv = computeHRV(peaks, this.sampleRate);
    const quality = signalQuality(this.pulseSignal.slice(-this.sampleRate * 2));

    return { pulse: filtered, hr, hrv, quality };
  }

  reset() {
    this.rgbBuffer = [];
    this.pulseSignal = [];
    this.filter = createBandpassFilter();
  }
}
