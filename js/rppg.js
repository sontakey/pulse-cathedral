/**
 * rPPG signal processing module.
 * Face detection (MediaPipe Face Mesh) + POS algorithm + peak detection + HRV.
 */

/** Bandpass filter range: 42–240 BPM → 0.7–4.0 Hz */
const BPM_MIN = 42;
const BPM_MAX = 240;

/** Sliding window length in frames (at ~30 fps ≈ 1.5s) */
const WINDOW_LENGTH = 45;

/**
 * MediaPipe Face Mesh landmark indices for ROI regions.
 * Forehead: central strip above brows.
 * Left cheek / right cheek: soft tissue areas with good blood perfusion.
 */
const FOREHEAD_INDICES = [10, 67, 69, 104, 108, 109, 151, 299, 297, 338, 337, 336];
const LEFT_CHEEK_INDICES = [36, 50, 116, 117, 118, 119, 123, 132, 147, 187, 205, 206];
const RIGHT_CHEEK_INDICES = [266, 280, 345, 346, 347, 348, 352, 361, 376, 411, 425, 426];

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
  return (s1[n - 1] - m1) + alpha * (s2[n - 1] - m2);
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
export { signalQuality } from './measurement.js';

/**
 * RPPGProcessor — stateful class that manages the full rPPG pipeline.
 */
export { RPPGProcessor } from './measurement.js';

/**
 * Extract bounding box for an ROI defined by landmark indices.
 * Returns {x, y, w, h} in pixel coordinates.
 *
 * @param {Array<{x: number, y: number}>} landmarks — normalized (0–1) landmarks
 * @param {number[]} indices — landmark indices for the ROI
 * @param {number} width — frame width in pixels
 * @param {number} height — frame height in pixels
 * @returns {{ x: number, y: number, w: number, h: number }}
 */
export function extractROIBox(landmarks, indices, width, height) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const idx of indices) {
    const lm = landmarks[idx];
    if (!lm) continue;
    const px = lm.x * width;
    const py = lm.y * height;
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }
  if (!isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
  const x = Math.max(0, Math.min(width, Math.floor(minX)));
  const y = Math.max(0, Math.min(height, Math.floor(minY)));
  const w = Math.max(0, Math.min(Math.ceil(maxX) - x, width - x));
  const h = Math.max(0, Math.min(Math.ceil(maxY) - y, height - y));
  return { x, y, w, h };
}

/**
 * Compute mean RGB from a region of an ImageData buffer.
 *
 * @param {Uint8ClampedArray} pixels — RGBA pixel data
 * @param {number} imgWidth — full image width
 * @param {{ x: number, y: number, w: number, h: number }} box — ROI bounding box
 * @returns {number[]} [r, g, b] mean values
 */
export function meanRGBFromROI(pixels, imgWidth, box) {
  let rSum = 0, gSum = 0, bSum = 0, count = 0;
  for (let row = box.y; row < box.y + box.h; row++) {
    for (let col = box.x; col < box.x + box.w; col++) {
      const i = (row * imgWidth + col) * 4;
      rSum += pixels[i];
      gSum += pixels[i + 1];
      bSum += pixels[i + 2];
      count++;
    }
  }
  if (count === 0) return [0, 0, 0];
  return [rSum / count, gSum / count, bSum / count];
}

/**
 * Extract combined mean RGB from forehead + cheeks ROIs.
 *
 * @param {Array<{x: number, y: number}>} landmarks — MediaPipe face landmarks
 * @param {Uint8ClampedArray} pixels — RGBA pixel data
 * @param {number} width — image width
 * @param {number} height — image height
 * @returns {number[]} [r, g, b] combined mean
 */
export function extractFaceROI(landmarks, pixels, width, height) {
  const regions = [FOREHEAD_INDICES, LEFT_CHEEK_INDICES, RIGHT_CHEEK_INDICES];
  let rTotal = 0, gTotal = 0, bTotal = 0, regionCount = 0;
  for (const indices of regions) {
    const box = extractROIBox(landmarks, indices, width, height);
    if (box.w > 0 && box.h > 0) {
      const [r, g, b] = meanRGBFromROI(pixels, width, box);
      rTotal += r;
      gTotal += g;
      bTotal += b;
      regionCount++;
    }
  }
  if (regionCount === 0) return [0, 0, 0];
  return [rTotal / regionCount, gTotal / regionCount, bTotal / regionCount];
}

/**
 * Compute coherence score (0–100) from inter-beat interval regularity.
 * High coherence = regular, rhythmic HRV pattern.
 *
 * @param {number[]} peakIndices
 * @param {number} sampleRate
 * @returns {number} 0–100 score
 */
export function computeCoherence(peakIndices, sampleRate) {
  if (peakIndices.length < 4) return 0;
  const ibis = [];
  for (let i = 1; i < peakIndices.length; i++) {
    ibis.push((peakIndices[i] - peakIndices[i - 1]) / sampleRate);
  }
  const mean = ibis.reduce((a, b) => a + b, 0) / ibis.length;
  if (mean <= 0) return 0;
  let sumSqDev = 0;
  for (const ibi of ibis) {
    sumSqDev += (ibi - mean) ** 2;
  }
  const cv = Math.sqrt(sumSqDev / ibis.length) / mean; // coefficient of variation
  // Map CV to 0–100: CV=0 → 100 (perfect regularity), CV≥0.3 → 0
  return Math.round(Math.max(0, Math.min(100, (1 - cv / 0.3) * 100)));
}

/**
 * Draw a sparkline of recent BPM values onto a canvas.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {number[]} bpmHistory — array of BPM values
 * @param {string} color — stroke color
 */
export function drawSparkline(canvas, bpmHistory, color = '#00f5d4') {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  if (bpmHistory.length < 2) return;

  const min = Math.min(...bpmHistory) - 2;
  const max = Math.max(...bpmHistory) + 2;
  const range = max - min || 1;

  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';

  for (let i = 0; i < bpmHistory.length; i++) {
    const x = (i / (bpmHistory.length - 1)) * w;
    const y = h - ((bpmHistory[i] - min) / range) * h;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

/**
 * FaceDetector — wraps MediaPipe Face Mesh for browser-based face detection.
 * Extracts ROI RGB values from detected face landmarks.
 */
export class FaceDetector {
  constructor() {
    this.faceMesh = null;
    this.lastLandmarks = null;
    this._ready = false;
    this._processing = false;
  }

  /**
   * Initialize MediaPipe Face Mesh.
   * Requires the MediaPipe CDN scripts to be loaded.
   */
  async init() {
    if (this._ready) return;
    if (this._initializing) return this._initializing;
    this._initializing = this._initialize();
    try { await this._initializing; } finally { this._initializing = null; }
  }

  async _initialize() {
    /* global FaceMesh */
    if (typeof FaceMesh === 'undefined') {
      throw new Error('MediaPipe FaceMesh not loaded. Include the CDN script.');
    }
    this.faceMesh = new FaceMesh({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`,
    });
    this.faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    this.faceMesh.onResults((results) => {
      if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        this.lastLandmarks = results.multiFaceLandmarks[0];
      } else {
        this.lastLandmarks = null;
      }
      this._processing = false;
    });
    await this.faceMesh.initialize();
    this._ready = true;
  }

  /**
   * Send a video frame for face detection.
   *
   * @param {HTMLVideoElement} video
   */
  async detect(video) {
    if (!this._ready || this._processing) return;
    this._processing = true;
    try { await this.faceMesh.send({ image: video }); } finally { this._processing = false; }
  }

  /**
   * Extract mean RGB from the last detected face ROI.
   *
   * @param {HTMLCanvasElement} canvas — off-screen canvas for pixel readback
   * @param {HTMLVideoElement} video — source video element
   * @returns {number[]|null} [r, g, b] or null if no face detected
   */
  sampleRGB(canvas, video) {
    if (!this.lastLandmarks) return null;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (w === 0 || h === 0) return null;
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(video, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    return extractFaceROI(this.lastLandmarks, imageData.data, w, h);
  }

  get hasFace() {
    return this.lastLandmarks !== null;
  }
}
