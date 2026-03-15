/**
 * Main application loop.
 * Connects rPPG processing to the Three.js scene and audio.
 */

import { RPPGProcessor } from './rppg.js';
import { SceneManager } from './scene.js';
import { AudioManager } from './audio.js';

const statusOverlay = document.getElementById('status-overlay');
const statusMessage = document.getElementById('status-message');
const hrValue = document.getElementById('hr-value');
const hrvValue = document.getElementById('hrv-value');
const coherenceValue = document.getElementById('coherence-value');
const signalFill = document.getElementById('signal-fill');

const rppg = new RPPGProcessor();
const scene = new SceneManager(document.getElementById('scene'));
const audio = new AudioManager();

/** Update the HUD elements with current biometric data. */
function updateHUD(data) {
  if (data.hr !== null) {
    hrValue.textContent = Math.round(data.hr);
  }
  if (data.hrv !== null) {
    hrvValue.textContent = Math.round(data.hrv);
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

  showStatus('Looking for face…');

  // Face detection and frame processing will be wired up
  // once MediaPipe Face Mesh is integrated in the rPPG task.
  // For now, this establishes the main application scaffold.

  hideStatus();
}

// Initialize on user interaction (needed for audio context)
document.addEventListener('click', () => {
  audio.init();
}, { once: true });

start();

export { rppg, scene, audio, updateHUD, hideStatus, showStatus };
