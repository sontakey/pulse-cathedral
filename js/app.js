/**
 * Main application loop.
 * Connects rPPG processing to the Three.js scene and audio.
 */

import {
  RPPGProcessor,
  FaceDetector,
  computeCoherence,
  detectPeaks,
  drawSparkline,
} from './rppg.js';
import { SceneManager } from './scene.js';
import { AudioManager } from './audio.js';

const statusOverlay = document.getElementById('status-overlay');
const statusMessage = document.getElementById('status-message');
const hrValue = document.getElementById('hr-value');
const hrvValue = document.getElementById('hrv-value');
const coherenceValue = document.getElementById('coherence-value');
const signalFill = document.getElementById('signal-fill');
const sparklineCanvas = document.getElementById('sparkline');

const rppg = new RPPGProcessor();
const face = new FaceDetector();
const scene = new SceneManager(document.getElementById('scene'));
const audio = new AudioManager();

/** Recent BPM readings for the sparkline (last 30 seconds at ~1 Hz). */
const bpmHistory = [];
const BPM_HISTORY_MAX = 30;

/** Track previous HR for beat detection. */
let lastPeakCount = 0;

/** Update the HUD elements with current biometric data. */
function updateHUD(data) {
  if (data.hr !== null) {
    hrValue.textContent = Math.round(data.hr);
  }
  if (data.hrv !== null) {
    hrvValue.textContent = Math.round(data.hrv);
  }
  if (data.coherence !== undefined) {
    coherenceValue.textContent = data.coherence;
  }
  signalFill.style.width = `${Math.round(data.quality * 100)}%`;

  // Color the signal bar: amber when poor, teal when strong
  if (data.quality < 0.4) {
    signalFill.style.backgroundColor = '#ffb703';
  } else {
    signalFill.style.backgroundColor = '#00f5d4';
  }
}

/** Hide the status overlay with a fade. */
function hideStatus() {
  statusOverlay.classList.add('hidden');
}

/** Show the status overlay with a message. */
function showStatus(msg) {
  statusMessage.textContent = msg;
  statusOverlay.classList.remove('hidden');
}

/** Process one frame: detect face, sample RGB, run rPPG pipeline. */
function processFrame(video, faceCanvas) {
  // Sample RGB from face ROI
  const rgb = face.sampleRGB(faceCanvas, video);
  if (!rgb) {
    showStatus('Looking for face\u2026');
    return;
  }
  hideStatus();

  const data = rppg.addSample(rgb);

  // Compute coherence from peaks
  const peaks = detectPeaks(rppg.pulseSignal);
  data.coherence = computeCoherence(peaks, rppg.sampleRate);

  // Detect new heartbeats by comparing peak count
  if (peaks.length > lastPeakCount && data.quality > 0.3) {
    scene.triggerBeat();
    audio.playBeat(Math.min(1, data.quality));
    lastPeakCount = peaks.length;
  }

  // Update scene with biometric data
  scene.update(data);
  updateHUD(data);

  // Record BPM for sparkline (~1 sample/second)
  if (data.hr !== null && rppg.pulseSignal.length % rppg.sampleRate === 0) {
    bpmHistory.push(Math.round(data.hr));
    if (bpmHistory.length > BPM_HISTORY_MAX) bpmHistory.shift();
    drawSparkline(sparklineCanvas, bpmHistory);
  }
}

/** Request webcam access and start the processing loop. */
async function start() {
  scene.init();
  scene.start();

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: 640, height: 480 },
      audio: false,
    });
  } catch (err) {
    showStatus('Camera access denied. Please allow camera access and reload.');
    return;
  }

  const video = document.getElementById('webcam');
  video.srcObject = stream;
  await video.play();

  showStatus('Loading face detection\u2026');

  const faceCanvas = document.getElementById('face-canvas');

  try {
    await face.init();
  } catch (err) {
    showStatus('Face detection unavailable. Check browser support.');
    return;
  }

  showStatus('Looking for face\u2026');

  // Process frames at ~30 fps
  let frameCount = 0;
  const loop = () => {
    frameCount++;
    // Run face detection every other frame (15 fps detection, 30 fps render)
    if (frameCount % 2 === 0) {
      face.detect(video);
    }
    processFrame(video, faceCanvas);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// Initialize on user interaction (needed for audio context)
document.addEventListener('click', () => {
  audio.init();
}, { once: true });

start();

export { rppg, face, scene, audio, updateHUD, hideStatus, showStatus, processFrame, bpmHistory };
