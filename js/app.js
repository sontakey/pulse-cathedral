/**
 * Main application loop.
 * Connects rPPG processing to the Three.js scene and audio.
 */

import {
  RPPGProcessor,
  FaceDetector,
  computeCoherence,
  detectPeaks,
} from './rppg.js';
import { SceneManager } from './scene.js';
import { AudioManager } from './audio.js';
import { createHUD } from './hud.js';
import { createBreathingGuide } from './breathing.js';

const statusOverlay = document.getElementById('status-overlay');
const statusMessage = document.getElementById('status-message');

const rppg = new RPPGProcessor();
const face = new FaceDetector();
const scene = new SceneManager(document.getElementById('scene'));
const audio = new AudioManager();
const hud = createHUD();
const breathing = createBreathingGuide();

/** Track previous peak count for beat detection. */
let lastPeakCount = 0;
/** Whether the ambient drone has been started. */
let droneStarted = false;

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
    if (hud) hud.triggerBeat();
    lastPeakCount = peaks.length;

    // Start ambient drone and awakening animation on first detected heartbeat
    if (!droneStarted) {
      audio.startDrone();
      scene.triggerAwakening();
      const hudEl = document.getElementById('hud');
      if (hudEl) hudEl.classList.add('awake');
      droneStarted = true;
    }
  }

  // Update ambient drone pitch and intensity with biometric data
  if (data.hr !== null) audio.updateDrone(data.hr);
  audio.updateDroneIntensity(data.quality);

  // Update breathing guide with HR stability
  breathing.updateFromData(data);

  // Pass breathing data to scene for visual response
  data.breathing = breathing.getBreathingData();

  // Update scene and HUD with biometric data
  scene.update(data);
  if (hud) hud.update(data);

  // Record BPM for sparkline (~1 sample/second)
  if (data.hr !== null && rppg.pulseSignal.length % rppg.sampleRate === 0) {
    if (hud) hud.recordBPM(data.hr);
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

export { rppg, face, scene, audio, hud, breathing, hideStatus, showStatus, processFrame };
