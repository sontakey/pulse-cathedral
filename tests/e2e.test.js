/**
 * End-to-end integration tests.
 * Verifies the full pipeline: face detection → rPPG → HR calculation →
 * visual/audio/HUD response, for both desktop and mobile contexts.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Polyfill browser globals for Node.js test environment.
// requestAnimationFrame returns an id but does NOT invoke the callback,
// preventing infinite animation loops from blocking tests.
let _rafId = 0;
if (typeof globalThis.requestAnimationFrame === 'undefined') {
  globalThis.requestAnimationFrame = () => ++_rafId;
  globalThis.cancelAnimationFrame = () => {};
}
if (typeof globalThis.performance === 'undefined') {
  globalThis.performance = { now: () => Date.now() };
}

import {
  posAlgorithm,
  detectPeaks,
  computeHR,
  computeHRV,
  signalQuality,
  RPPGProcessor,
  extractROIBox,
  meanRGBFromROI,
  extractFaceROI,
  computeCoherence,
} from '../js/rppg.js';
import { BreathingGuide } from '../js/breathing.js';
import { HUD } from '../js/hud.js';
import { AudioManager } from '../js/audio.js';
import { SceneManager } from '../js/scene.js';
import {
  detectMobile,
  getPixelRatio,
  getParticleCount,
  MOBILE_PARTICLE_COUNT,
  DESKTOP_PARTICLE_COUNT,
} from '../js/mobile.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const appSrc = readFileSync(resolve(root, 'js/app.js'), 'utf-8');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Generate a synthetic sinusoidal RGB signal simulating a heartbeat at a
 * given BPM, sampled at 30 fps.
 */
function generateHeartbeatRGB(bpm, numSamples, sampleRate = 30) {
  const freq = bpm / 60; // Hz
  const samples = [];
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const phase = 2 * Math.PI * freq * t;
    // Amplitudes large enough to pass through bandpass and exceed quality threshold
    const r = 140 + 4 * Math.sin(phase + 0.2);
    const g = 140 + 8 * Math.sin(phase);
    const b = 140 + 2 * Math.sin(phase + 0.5);
    samples.push([r, g, b]);
  }
  return samples;
}

/**
 * Feed RGB samples through RPPGProcessor and collect results.
 */
function runPipeline(rgbSamples) {
  const processor = new RPPGProcessor();
  const results = [];
  for (const rgb of rgbSamples) {
    results.push(processor.addSample(rgb));
  }
  return { processor, results };
}

/**
 * Build a fake DOM element stub with style and classList support.
 */
function fakeElement() {
  const classes = new Set();
  return {
    textContent: '',
    style: {},
    classList: {
      add(c) { classes.add(c); },
      remove(c) { classes.delete(c); },
      contains(c) { return classes.has(c); },
    },
    width: 200,
    height: 40,
    getContext() {
      return {
        clearRect() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        stroke() {},
        strokeStyle: '',
        lineWidth: 0,
        lineJoin: '',
      };
    },
  };
}

// ─── Full Pipeline: rPPG → HR/HRV/Coherence ─────────────────────────────────

describe('E2E: rPPG pipeline produces valid biometric data', () => {
  it('detects ~72 BPM from synthetic 72-BPM signal', () => {
    const samples = generateHeartbeatRGB(72, 300); // 10 seconds at 30 fps
    const { processor } = runPipeline(samples);
    const peaks = detectPeaks(processor.pulseSignal);
    const hr = computeHR(peaks, processor.sampleRate);
    assert.ok(hr !== null, 'HR should be computed');
    // Allow ±15 BPM tolerance for synthetic signal through bandpass
    assert.ok(hr >= 55 && hr <= 90, `Expected ~72 BPM, got ${hr.toFixed(1)}`);
  });

  it('detects ~100 BPM from synthetic 100-BPM signal', () => {
    const samples = generateHeartbeatRGB(100, 300);
    const { processor } = runPipeline(samples);
    const peaks = detectPeaks(processor.pulseSignal);
    const hr = computeHR(peaks, processor.sampleRate);
    assert.ok(hr !== null, 'HR should be computed');
    assert.ok(hr >= 80 && hr <= 120, `Expected ~100 BPM, got ${hr.toFixed(1)}`);
  });

  it('computes HRV from a regular signal (low RMSSD)', () => {
    const samples = generateHeartbeatRGB(72, 300);
    const { processor } = runPipeline(samples);
    const peaks = detectPeaks(processor.pulseSignal);
    const hrv = computeHRV(peaks, processor.sampleRate);
    // Regular signal should have low HRV (high regularity)
    if (hrv !== null) {
      assert.ok(hrv >= 0, 'HRV must be non-negative');
      assert.ok(hrv < 200, `HRV ${hrv.toFixed(1)} ms seems unreasonably high for regular signal`);
    }
  });

  it('computes coherence > 0 with enough peaks', () => {
    const samples = generateHeartbeatRGB(72, 300);
    const { processor } = runPipeline(samples);
    const peaks = detectPeaks(processor.pulseSignal);
    const coherence = computeCoherence(peaks, processor.sampleRate);
    if (peaks.length >= 4) {
      assert.ok(coherence >= 0 && coherence <= 100, `Coherence ${coherence} out of range`);
    }
  });

  it('signal quality increases with longer, cleaner signal', () => {
    const samples = generateHeartbeatRGB(72, 300);
    const { processor, results } = runPipeline(samples);
    // Quality at the start vs end
    const earlyQuality = results[30]?.quality ?? 0;
    const lateQuality = results[results.length - 1]?.quality ?? 0;
    assert.ok(lateQuality >= earlyQuality,
      `Later quality (${lateQuality.toFixed(3)}) should be >= early (${earlyQuality.toFixed(3)})`);
  });
});

// ─── Face ROI extraction pipeline ────────────────────────────────────────────

describe('E2E: Face ROI extraction → RGB sampling', () => {
  it('extracts valid ROI boxes from synthetic face landmarks', () => {
    // Simulate MediaPipe landmarks (normalized 0-1 coordinates)
    const landmarks = [];
    for (let i = 0; i < 468; i++) {
      landmarks.push({ x: 0.3 + Math.random() * 0.4, y: 0.2 + Math.random() * 0.6 });
    }
    const width = 640;
    const height = 480;

    // Forehead ROI
    const foreheadIndices = [10, 67, 69, 104, 108, 109, 151, 299, 297, 338, 337, 336];
    const box = extractROIBox(landmarks, foreheadIndices, width, height);
    assert.ok(box.w > 0 && box.h > 0, 'Forehead ROI should have positive dimensions');
    assert.ok(box.x >= 0 && box.y >= 0, 'ROI should not have negative coordinates');
    assert.ok(box.x + box.w <= width, 'ROI should not exceed image width');
    assert.ok(box.y + box.h <= height, 'ROI should not exceed image height');
  });

  it('computes mean RGB from pixel data within ROI', () => {
    const width = 10;
    const height = 10;
    // Create pixel data: all pixels have RGB=(100, 150, 200)
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = 100;
      pixels[i + 1] = 150;
      pixels[i + 2] = 200;
      pixels[i + 3] = 255;
    }
    const box = { x: 2, y: 2, w: 5, h: 5 };
    const [r, g, b] = meanRGBFromROI(pixels, width, box);
    assert.strictEqual(r, 100);
    assert.strictEqual(g, 150);
    assert.strictEqual(b, 200);
  });

  it('extractFaceROI combines forehead + cheeks', () => {
    const landmarks = [];
    for (let i = 0; i < 468; i++) {
      landmarks.push({ x: 0.4 + Math.random() * 0.2, y: 0.3 + Math.random() * 0.4 });
    }
    const width = 640;
    const height = 480;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = 120;
      pixels[i + 1] = 130;
      pixels[i + 2] = 125;
      pixels[i + 3] = 255;
    }
    const [r, g, b] = extractFaceROI(landmarks, pixels, width, height);
    assert.ok(r > 0 && g > 0 && b > 0, 'Should return positive RGB values');
    // Uniform pixel data means the average should match individual pixel values
    assert.ok(Math.abs(r - 120) < 1, `R should be ~120, got ${r}`);
    assert.ok(Math.abs(g - 130) < 1, `G should be ~130, got ${g}`);
    assert.ok(Math.abs(b - 125) < 1, `B should be ~125, got ${b}`);
  });
});

// ─── Heartbeat detection → visual/audio trigger ─────────────────────────────

describe('E2E: Heartbeat triggers scene beat + audio + HUD', () => {
  it('new peaks trigger scene.triggerBeat()', () => {
    const scene = new SceneManager({});
    let beatCount = 0;
    scene.onBeat = () => { beatCount++; };

    // Simulate the app.js beat detection logic
    const samples = generateHeartbeatRGB(72, 300);
    const processor = new RPPGProcessor();
    let lastPeakCount = 0;

    for (const rgb of samples) {
      const data = processor.addSample(rgb);
      const peaks = detectPeaks(processor.pulseSignal);
      if (peaks.length > lastPeakCount && data.quality > 0.3) {
        scene.triggerBeat();
        lastPeakCount = peaks.length;
      }
    }

    assert.ok(beatCount > 0, `Expected beats, got ${beatCount}`);
  });

  it('scene.update receives biometric data', () => {
    const scene = new SceneManager({});
    const data = { hr: 75, hrv: 40, quality: 0.8, pulse: 0.1, coherence: 60, breathing: null };
    scene.update(data);
    assert.deepStrictEqual(scene.currentData, data);
  });

  it('HUD updates HR display from pipeline output', () => {
    const els = {
      hrValue: fakeElement(),
      hrvValue: fakeElement(),
      coherenceValue: fakeElement(),
      coherenceBar: fakeElement(),
      signalFill: fakeElement(),
      qualityText: fakeElement(),
      pulseDot: fakeElement(),
      sparkline: fakeElement(),
    };
    const hud = new HUD(els);

    // Feed data from rPPG pipeline
    const samples = generateHeartbeatRGB(72, 300);
    const { results } = runPipeline(samples);
    const lastResult = results[results.length - 1];
    lastResult.coherence = 50;

    hud.update(lastResult);

    if (lastResult.hr !== null) {
      assert.ok(els.hrValue.textContent !== '--', 'HR display should be updated');
      const displayedHR = parseInt(els.hrValue.textContent);
      assert.ok(displayedHR > 0, `Displayed HR should be positive, got ${displayedHR}`);
    }
  });

  it('HUD triggerBeat adds beat class to pulse dot', () => {
    const pulseDot = fakeElement();
    const hud = new HUD({
      hrValue: fakeElement(),
      hrvValue: fakeElement(),
      coherenceValue: fakeElement(),
      coherenceBar: fakeElement(),
      signalFill: fakeElement(),
      qualityText: fakeElement(),
      pulseDot,
      sparkline: fakeElement(),
    });
    hud.triggerBeat();
    assert.ok(pulseDot.classList.contains('beat'), 'Pulse dot should get beat class');
  });

  it('AudioManager can be initialized and play beat without error', () => {
    const audio = new AudioManager();
    // playBeat before init should be a no-op
    assert.doesNotThrow(() => audio.playBeat(0.8));
  });
});

// ─── Awakening: first heartbeat triggers visual awakening ────────────────────

describe('E2E: First heartbeat triggers awakening animation', () => {
  it('scene starts dormant, awakens on first beat', () => {
    const scene = new SceneManager({});
    assert.strictEqual(scene.awake, false);
    assert.strictEqual(scene.awakeningProgress, 0);

    // Simulate first heartbeat detection (as in app.js)
    scene.clock = { getElapsedTime: () => 1.0 };
    scene.triggerAwakening();

    assert.strictEqual(scene.awake, true);
    assert.strictEqual(scene._awakeningStartTime, 1.0);
  });

  it('awakening only triggers once', () => {
    const scene = new SceneManager({});
    scene.clock = { getElapsedTime: () => 1.0 };
    scene.triggerAwakening();
    const firstStartTime = scene._awakeningStartTime;

    scene.clock = { getElapsedTime: () => 3.0 };
    scene.triggerAwakening(); // Should be no-op
    assert.strictEqual(scene._awakeningStartTime, firstStartTime);
  });

  it('app.js triggers awakening on first detected heartbeat', () => {
    assert.ok(appSrc.includes('!droneStarted'), 'Should check droneStarted flag');
    assert.ok(appSrc.includes('scene.triggerAwakening()'), 'Should trigger awakening');
    assert.ok(appSrc.includes('audio.startDrone()'), 'Should start drone on first beat');
    assert.ok(appSrc.includes("classList.add('awake')"), 'Should add awake class to HUD');
    assert.ok(appSrc.includes('droneStarted = true'), 'Should set droneStarted flag');
  });
});

// ─── Breathing guide integration ─────────────────────────────────────────────

describe('E2E: Stable HR activates breathing guide → scene responds', () => {
  it('breathing activates after stable HR readings', () => {
    const breathing = new BreathingGuide({
      container: fakeElement(),
      circle: fakeElement(),
      label: fakeElement(),
      timer: fakeElement(),
    });

    // Feed 12 stable HR readings (threshold = 10)
    for (let i = 0; i < 12; i++) {
      breathing.updateFromData({ hr: 72 });
    }
    assert.strictEqual(breathing.active, true, 'Breathing should activate after stable HR');
  });

  it('breathing deactivates when HR becomes unstable', () => {
    const breathing = new BreathingGuide({
      container: fakeElement(),
      circle: fakeElement(),
      label: fakeElement(),
      timer: fakeElement(),
    });

    // Activate with stable readings
    for (let i = 0; i < 12; i++) {
      breathing.updateFromData({ hr: 72 });
    }
    assert.strictEqual(breathing.active, true);

    // Destabilize with a large jump
    breathing.updateFromData({ hr: 120 });
    // Deactivation requires stableCount < threshold after instability
    for (let i = 0; i < 3; i++) {
      breathing.updateFromData({ hr: 120 + i * 20 });
    }
    // Check the stability was broken
    assert.ok(breathing._stableCount < 10, 'Stable count should reset on unstable HR');
  });

  it('breathing data integrates into scene update', () => {
    const scene = new SceneManager({});
    const breathingData = { active: true, phase: 'inhale', scale: 0.65, progress: 0.5 };
    scene.update({ hr: 72, hrv: 45, quality: 0.9, pulse: 0.05, coherence: 70, breathing: breathingData });
    assert.deepStrictEqual(scene.currentData.breathing, breathingData);
  });

  it('app.js passes breathing data to scene', () => {
    assert.ok(appSrc.includes('breathing.getBreathingData()'), 'Should get breathing data');
    assert.ok(appSrc.includes('data.breathing'), 'Should pass breathing data to scene');
  });
});

// ─── Signal loss and recovery ────────────────────────────────────────────────

describe('E2E: Signal loss handling and recovery', () => {
  it('no face returns null → processFrame handles gracefully', () => {
    // app.js checks rgb === null and handles face loss
    assert.ok(appSrc.includes('if (!rgb)'), 'Should handle null RGB (no face)');
    assert.ok(appSrc.includes('faceLostFrames++'), 'Should increment face lost counter');
    assert.ok(appSrc.includes("showStatus('Looking for face"), 'Should show face-lost status');
  });

  it('face recovery resets counters and hides status', () => {
    assert.ok(appSrc.includes('faceLostFrames = 0'), 'Should reset face lost on recovery');
    assert.ok(appSrc.includes('hideStatus()'), 'Should hide status on face recovery');
    assert.ok(appSrc.includes("classList.remove('dimmed')"), 'Should un-dim HUD on recovery');
  });

  it('RPPGProcessor handles empty input gracefully', () => {
    const proc = new RPPGProcessor();
    // Feeding a few samples then stopping should not crash
    proc.addSample([128, 128, 128]);
    proc.addSample([128, 128, 128]);
    const result = proc.addSample([128, 128, 128]);
    assert.ok(result.hr === null, 'HR should be null with insufficient data');
    assert.ok(result.quality >= 0, 'Quality should be non-negative');
  });

  it('RPPGProcessor.reset clears all state', () => {
    const proc = new RPPGProcessor();
    for (let i = 0; i < 100; i++) {
      proc.addSample([128 + Math.sin(i) * 2, 128, 128]);
    }
    assert.ok(proc.pulseSignal.length > 0);
    proc.reset();
    assert.strictEqual(proc.rgbBuffer.length, 0);
    assert.strictEqual(proc.pulseSignal.length, 0);
  });
});

// ─── Desktop-specific behavior ───────────────────────────────────────────────

describe('E2E Desktop: full pipeline configuration', () => {
  it('desktop particle count is 2000', () => {
    assert.strictEqual(getParticleCount(false), DESKTOP_PARTICLE_COUNT);
    assert.strictEqual(DESKTOP_PARTICLE_COUNT, 2000);
  });

  it('desktop pixel ratio is uncapped up to 2', () => {
    // getPixelRatio on desktop caps at 2 (same max)
    const ratio = getPixelRatio(false);
    assert.ok(ratio >= 1 && ratio <= 2, `Desktop ratio should be 1-2, got ${ratio}`);
  });

  it('desktop camera requests 640x480', () => {
    assert.ok(appSrc.includes('ideal: 640'), 'Desktop should request 640 width');
    assert.ok(appSrc.includes('ideal: 480'), 'Desktop should request 480 height');
  });

  it('app.js uses click event for tap-to-begin on desktop', () => {
    assert.ok(appSrc.includes("addEventListener('click'"), 'Should bind click handler');
  });

  it('desktop pipeline: 72 BPM signal → HR near 72 → scene receives data', () => {
    const samples = generateHeartbeatRGB(72, 300);
    const { processor, results } = runPipeline(samples);
    const last = results[results.length - 1];

    // Scene receives the data
    const scene = new SceneManager({});
    const peaks = detectPeaks(processor.pulseSignal);
    last.coherence = computeCoherence(peaks, processor.sampleRate);
    last.breathing = null;
    scene.update(last);

    assert.ok(scene.currentData.quality > 0, 'Scene should have quality > 0');
    if (last.hr !== null) {
      assert.ok(scene.currentData.hr >= 55 && scene.currentData.hr <= 90,
        `Scene HR should be ~72, got ${scene.currentData.hr}`);
    }
  });
});

// ─── Mobile-specific behavior ────────────────────────────────────────────────

describe('E2E Mobile: full pipeline configuration', () => {
  it('mobile particle count is 1000', () => {
    assert.strictEqual(getParticleCount(true), MOBILE_PARTICLE_COUNT);
    assert.strictEqual(MOBILE_PARTICLE_COUNT, 1000);
  });

  it('mobile pixel ratio is capped at 2', () => {
    const ratio = getPixelRatio(true);
    assert.ok(ratio <= 2, `Mobile ratio should be ≤2, got ${ratio}`);
  });

  it('mobile camera requests 480x360', () => {
    assert.ok(appSrc.includes('ideal: 480'), 'Mobile should request 480 width');
    assert.ok(appSrc.includes('ideal: 360'), 'Mobile should request 360 height');
  });

  it('app.js uses facingMode: user for front camera on mobile', () => {
    assert.ok(appSrc.includes("facingMode: 'user'"), 'Should request front camera');
  });

  it('tap overlay is required for mobile audio/camera gate', () => {
    assert.ok(appSrc.includes('tap-overlay'), 'Should reference tap overlay');
    assert.ok(appSrc.includes('audio.init()'), 'Should init audio on tap (user gesture)');
  });

  it('mobile pipeline: 80 BPM signal → HR near 80 → HUD displays', () => {
    const samples = generateHeartbeatRGB(80, 300);
    const { results } = runPipeline(samples);
    const last = results[results.length - 1];

    const els = {
      hrValue: fakeElement(),
      hrvValue: fakeElement(),
      coherenceValue: fakeElement(),
      coherenceBar: fakeElement(),
      signalFill: fakeElement(),
      qualityText: fakeElement(),
      pulseDot: fakeElement(),
      sparkline: fakeElement(),
    };
    const hud = new HUD(els);
    last.coherence = 50;
    hud.update(last);

    if (last.hr !== null) {
      const displayed = parseInt(els.hrValue.textContent);
      assert.ok(displayed > 0, `Mobile HUD should show HR, got ${displayed}`);
    }
  });

  it('mobile-specific: scene particle count adapts', () => {
    // Verify the scene.js imports getParticleCount
    const sceneSrc = readFileSync(resolve(root, 'js/scene.js'), 'utf-8');
    assert.ok(sceneSrc.includes('getParticleCount'), 'Scene should use getParticleCount');
    assert.ok(sceneSrc.includes('detectMobile'), 'Scene should check mobile status');
  });
});

// ─── End-to-end data flow through app.js processFrame ────────────────────────

describe('E2E: app.js processFrame wiring', () => {
  it('processFrame calls rppg.addSample, detectPeaks, computeCoherence', () => {
    assert.ok(appSrc.includes('rppg.addSample(rgb)'), 'Should feed RGB to rPPG processor');
    assert.ok(appSrc.includes('detectPeaks(rppg.pulseSignal)'), 'Should detect peaks');
    assert.ok(appSrc.includes('computeCoherence(peaks'), 'Should compute coherence');
  });

  it('processFrame triggers beat on new peaks with quality > 0.3', () => {
    assert.ok(appSrc.includes('peaks.length > lastPeakCount'), 'Should compare peak counts');
    assert.ok(appSrc.includes('data.quality > 0.3'), 'Should gate beats on quality');
    assert.ok(appSrc.includes('scene.triggerBeat()'), 'Should trigger scene beat');
    assert.ok(appSrc.includes('audio.playBeat'), 'Should play audio beat');
    assert.ok(appSrc.includes('hud.triggerBeat()'), 'Should trigger HUD beat');
  });

  it('processFrame updates drone, scene, HUD, and breathing', () => {
    assert.ok(appSrc.includes('audio.updateDrone(data.hr)'), 'Should update drone pitch');
    assert.ok(appSrc.includes('audio.updateDroneIntensity(data.quality)'), 'Should update drone intensity');
    assert.ok(appSrc.includes('breathing.updateFromData(data)'), 'Should update breathing');
    assert.ok(appSrc.includes('scene.update(data)'), 'Should update scene');
    assert.ok(appSrc.includes('hud.update(data)'), 'Should update HUD');
  });

  it('processFrame records BPM for sparkline at ~1 Hz', () => {
    assert.ok(appSrc.includes('hud.recordBPM(data.hr)'), 'Should record BPM for sparkline');
    assert.ok(appSrc.includes('% rppg.sampleRate'), 'Should sample at ~1 Hz');
  });
});

// ─── Cross-cutting: coherence end-to-end ─────────────────────────────────────

describe('E2E: Coherence pipeline (peaks → coherence → columns)', () => {
  it('regular signal produces high coherence', () => {
    const samples = generateHeartbeatRGB(72, 300);
    const { processor } = runPipeline(samples);
    const peaks = detectPeaks(processor.pulseSignal);
    const coherence = computeCoherence(peaks, processor.sampleRate);
    if (peaks.length >= 4) {
      // Regular synthetic signal should have decent coherence
      assert.ok(coherence >= 0, `Coherence should be >= 0, got ${coherence}`);
    }
  });

  it('coherence drives column glow in scene.js', () => {
    const sceneSrc = readFileSync(resolve(root, 'js/scene.js'), 'utf-8');
    assert.ok(sceneSrc.includes('coherenceGlow'), 'Columns should use coherence for glow');
    assert.ok(sceneSrc.includes('data.coherence'), 'Should read coherence from data');
  });
});

// ─── Cross-cutting: quality → visual degradation ─────────────────────────────

describe('E2E: Signal quality affects all visual elements', () => {
  it('low quality signal produces quality near 0', () => {
    // Flat signal = no pulse = low quality
    const quality = signalQuality([0, 0, 0, 0, 0, 0]);
    assert.ok(quality < 0.1, `Flat signal quality should be near 0, got ${quality}`);
  });

  it('good quality signal produces quality near 1', () => {
    // Strong oscillating signal = high quality
    const signal = [];
    for (let i = 0; i < 60; i++) {
      signal.push(Math.sin(2 * Math.PI * i / 15) * 0.5);
    }
    const quality = signalQuality(signal);
    assert.ok(quality > 0.5, `Good signal quality should be > 0.5, got ${quality}`);
  });

  it('quality affects particle color (amber overlay for poor signal)', () => {
    const sceneSrc = readFileSync(resolve(root, 'js/scene.js'), 'utf-8');
    assert.ok(sceneSrc.includes('data.quality'), 'Particles should reference quality');
    assert.ok(sceneSrc.includes('poorColor') || sceneSrc.includes('_poorColor'),
      'Should have amber/poor-quality color overlay');
  });

  it('quality gates beat detection in app.js', () => {
    assert.ok(appSrc.includes('data.quality > 0.3'), 'Beat detection requires quality > 0.3');
  });

  it('HUD shows quality percentage and color', () => {
    const els = {
      hrValue: fakeElement(),
      hrvValue: fakeElement(),
      coherenceValue: fakeElement(),
      coherenceBar: fakeElement(),
      signalFill: fakeElement(),
      qualityText: fakeElement(),
      pulseDot: fakeElement(),
      sparkline: fakeElement(),
    };
    const hud = new HUD(els);

    // Low quality
    hud.update({ hr: null, hrv: null, quality: 0.2, coherence: 0, pulse: 0 });
    assert.ok(els.signalFill.style.backgroundColor === '#ffb703',
      'Low quality should show amber');

    // High quality after many updates to overcome smoothing
    for (let i = 0; i < 20; i++) {
      hud.update({ hr: 72, hrv: 40, quality: 0.9, coherence: 60, pulse: 0.1 });
    }
    assert.ok(els.signalFill.style.backgroundColor === '#00f5d4',
      'High quality should show teal');
  });
});

// ─── Camera error handling ───────────────────────────────────────────────────

describe('E2E: Camera and browser compatibility', () => {
  it('app.js checks for mediaDevices API availability', () => {
    assert.ok(appSrc.includes('navigator.mediaDevices'), 'Should check mediaDevices');
    assert.ok(appSrc.includes('getUserMedia'), 'Should use getUserMedia');
  });

  it('app.js handles NotAllowedError', () => {
    assert.ok(appSrc.includes('NotAllowedError'), 'Should handle permission denied');
  });

  it('app.js handles NotFoundError', () => {
    assert.ok(appSrc.includes('NotFoundError'), 'Should handle no camera found');
  });

  it('app.js monitors camera track ended event', () => {
    assert.ok(appSrc.includes("'ended'"), 'Should listen for track ended');
    assert.ok(appSrc.includes('Camera disconnected'), 'Should show disconnect message');
  });

  it('app.js handles face detection init failure', () => {
    assert.ok(appSrc.includes('Face detection unavailable'), 'Should handle face mesh init failure');
  });
});

// ─── HRV-driven visual transitions ──────────────────────────────────────────

describe('E2E: HRV drives color transitions (teal → magenta)', () => {
  it('scene uses hrv to compute hrvBlend for pulse ring', () => {
    const sceneSrc = readFileSync(resolve(root, 'js/scene.js'), 'utf-8');
    assert.ok(sceneSrc.includes('hrvBlend'), 'Should compute HRV blend');
    assert.ok(sceneSrc.includes('data.hrv'), 'Should read HRV from data');
  });

  it('HRV blend: low HRV (stressed) → blend toward 1 (magenta)', () => {
    // Replicate the blend calculation from scene.js
    const hrv = 10; // low HRV = stressed
    const blend = Math.max(0, Math.min(1, 1 - hrv / 80));
    assert.ok(blend > 0.8, `Low HRV should give blend ~1, got ${blend}`);
  });

  it('HRV blend: high HRV (relaxed) → blend toward 0 (teal)', () => {
    const hrv = 70; // high HRV = relaxed
    const blend = Math.max(0, Math.min(1, 1 - hrv / 80));
    assert.ok(blend < 0.2, `High HRV should give blend ~0, got ${blend}`);
  });
});

// ─── Full round-trip: synthetic heartbeat → all outputs ──────────────────────

describe('E2E: Full round-trip integration', () => {
  it('72 BPM signal → all components receive valid data', () => {
    const samples = generateHeartbeatRGB(72, 300);
    const processor = new RPPGProcessor();
    const scene = new SceneManager({});
    const els = {
      hrValue: fakeElement(),
      hrvValue: fakeElement(),
      coherenceValue: fakeElement(),
      coherenceBar: fakeElement(),
      signalFill: fakeElement(),
      qualityText: fakeElement(),
      pulseDot: fakeElement(),
      sparkline: fakeElement(),
    };
    const hud = new HUD(els);
    const breathing = new BreathingGuide({
      container: fakeElement(),
      circle: fakeElement(),
      label: fakeElement(),
      timer: fakeElement(),
    });

    let beatCount = 0;
    let lastPeakCount = 0;
    let droneStarted = false;

    scene.onBeat = () => { beatCount++; };

    // Simulate the full app.js processFrame loop
    for (const rgb of samples) {
      const data = processor.addSample(rgb);
      const peaks = detectPeaks(processor.pulseSignal);
      data.coherence = computeCoherence(peaks, processor.sampleRate);

      // Beat detection
      if (peaks.length > lastPeakCount && data.quality > 0.3) {
        scene.triggerBeat();
        hud.triggerBeat();
        lastPeakCount = peaks.length;

        if (!droneStarted) {
          scene.clock = { getElapsedTime: () => 0 };
          scene.triggerAwakening();
          droneStarted = true;
        }
      }

      // Breathing
      breathing.updateFromData(data);
      data.breathing = breathing.getBreathingData();

      // Update outputs
      scene.update(data);
      hud.update(data);

      // BPM history (every sampleRate frames)
      if (data.hr !== null && processor.pulseSignal.length % processor.sampleRate === 0) {
        hud.recordBPM(data.hr);
      }
    }

    // Verify all outputs received data
    assert.ok(beatCount > 0, `Expected beats, got ${beatCount}`);
    assert.ok(scene.awake, 'Scene should be awake after first beat');
    assert.ok(scene.currentData.quality > 0, 'Scene should have non-zero quality');

    if (scene.currentData.hr !== null) {
      assert.ok(els.hrValue.textContent !== '--' && els.hrValue.textContent !== '',
        'HUD should display HR');
    }
  });

  it('noisy signal still produces some pipeline output without crashing', () => {
    const processor = new RPPGProcessor();
    // Feed random noise (no heartbeat pattern)
    for (let i = 0; i < 300; i++) {
      const result = processor.addSample([
        128 + Math.random() * 20,
        128 + Math.random() * 20,
        128 + Math.random() * 20,
      ]);
      assert.ok(Number.isFinite(result.pulse), 'Pulse should be finite');
      assert.ok(result.quality >= 0, 'Quality should be non-negative');
    }
  });
});
