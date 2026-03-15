/**
 * Tests for rPPG-to-visuals integration.
 * Validates that biometric data (HR, HRV, coherence, quality, pulse) drives
 * all visual elements: pulse ring, particles, waveform, columns, and grid.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const sceneSrc = readFileSync(resolve(root, 'js/scene.js'), 'utf-8');
const appSrc = readFileSync(resolve(root, 'js/app.js'), 'utf-8');

/**
 * Extract the body of a method from scene.js source.
 * Uses the JSDoc comment or method definition as boundary markers.
 */
function extractMethod(src, methodName) {
  // Find the method definition (the comment + function line)
  const defPattern = `  ${methodName}(`;
  const startIdx = src.indexOf(defPattern);
  if (startIdx === -1) return '';
  // Find the next method definition or end of class
  const rest = src.substring(startIdx);
  // Look for the next "  _animate" or "  /** " method definition after at least 10 chars
  const nextMethod = rest.substring(10).search(/\n  (?:\/\*\*|_animate|_build|dispose|stop|start|update|triggerBeat)/);
  if (nextMethod === -1) return rest;
  return rest.substring(0, nextMethod + 10);
}

const pulseRingBody = extractMethod(sceneSrc, '_animatePulseRing');
const particlesBody = extractMethod(sceneSrc, '_animateParticles');
const waveformBody = extractMethod(sceneSrc, '_animateWaveform');
const columnsBody = extractMethod(sceneSrc, '_animateColumns');
const gridBody = extractMethod(sceneSrc, '_animateGrid');

// ─── SceneManager data flow ─────────────────────────────────────────────────

describe('SceneManager default data includes coherence', () => {
  it('currentData has coherence field', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    assert.strictEqual(mgr.currentData.coherence, 0);
  });

  it('update stores coherence from data', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    mgr.update({ hr: 72, hrv: 50, quality: 0.8, pulse: 0.1, coherence: 85 });
    assert.strictEqual(mgr.currentData.coherence, 85);
  });
});

// ─── Pulse ring: HR-driven radius ──────────────────────────────────────────

describe('Pulse ring HR-driven radius', () => {
  it('computes hrScale from HR', () => {
    assert.ok(pulseRingBody.includes('hrScale'), 'Should compute hrScale');
  });

  it('uses 72 BPM as baseline for ring size', () => {
    assert.ok(pulseRingBody.includes('72 / data.hr'), 'Should divide 72 by HR');
  });

  it('clamps hrScale between 0.7 and 1.3', () => {
    assert.ok(pulseRingBody.includes('Math.max(0.7'), 'Should clamp lower bound');
    assert.ok(pulseRingBody.includes('Math.min(1.3'), 'Should clamp upper bound');
  });

  it('defaults to scale 1.0 when HR is null', () => {
    assert.ok(pulseRingBody.includes(': 1.0'), 'Should default to 1.0 when HR is null');
  });
});

// ─── Pulse ring: HRV color blend ────────────────────────────────────────────

describe('Pulse ring HRV color blend', () => {
  it('computes hrvBlend in _animatePulseRing', () => {
    assert.ok(pulseRingBody.includes('hrvBlend'), 'Should compute HRV blend');
    assert.ok(pulseRingBody.includes('data.hrv / 80'), 'Should map HRV with 80 threshold');
  });

  it('passes hrvBlend to glow ring shader uniform', () => {
    assert.ok(pulseRingBody.includes('uBlend.value = hrvBlend'), 'Should drive uBlend uniform');
  });
});

// ─── Particles: HRV color mapping ───────────────────────────────────────────

describe('Particle HRV color mapping', () => {
  it('blends particle color based on HRV', () => {
    assert.ok(particlesBody.includes('hrvBlend'), 'Particles should compute HRV blend');
  });

  it('lerps between teal and magenta for HRV', () => {
    assert.ok(particlesBody.includes('MAGENTA'), 'Should use MAGENTA for warm/stressed color');
    assert.ok(particlesBody.includes('NEON_TEAL'), 'Should use NEON_TEAL for cool/relaxed color');
    assert.ok(particlesBody.includes('.lerp('), 'Should lerp between colors');
  });

  it('overlays quality-driven amber for poor signal', () => {
    assert.ok(particlesBody.includes('0xffb703'), 'Should use amber for poor quality');
    assert.ok(particlesBody.includes('data.quality'), 'Should use quality for amber blend');
  });
});

// ─── Particles: HR-driven speed ─────────────────────────────────────────────

describe('Particle HR-driven speed', () => {
  it('computes speed factor from HR', () => {
    assert.ok(particlesBody.includes('data.hr / 72'), 'Should compute HR factor from 72 BPM baseline');
    assert.ok(particlesBody.includes('hrFactor'), 'Should name it hrFactor');
  });

  it('defaults speed to 1x when HR is null', () => {
    assert.ok(particlesBody.includes('data.hr !== null ? data.hr / 72 : 1'),
      'Should default to factor 1 when HR is null');
  });
});

// ─── Waveform: HRV-driven breathing amplitude ──────────────────────────────

describe('Waveform HRV-driven breathing', () => {
  it('computes HRV amplitude for Z-axis motion', () => {
    assert.ok(waveformBody.includes('hrvAmp'), 'Should compute HRV amplitude');
  });

  it('maps high HRV to deeper breathing motion', () => {
    assert.ok(waveformBody.includes('data.hrv / 200'), 'Should scale HRV by 200');
    assert.ok(waveformBody.includes('Math.min(0.3'), 'Should cap amplitude at 0.3');
  });

  it('defaults to 0.1 amplitude when HRV is null', () => {
    assert.ok(waveformBody.includes(': 0.1'), 'Should default to 0.1 when HRV is null');
  });

  it('uses hrvAmp in Z-axis calculation', () => {
    assert.ok(waveformBody.includes('* hrvAmp'), 'Should multiply sine by hrvAmp');
  });
});

// ─── Columns: coherence-driven brightness ───────────────────────────────────

describe('Column coherence-driven brightness', () => {
  it('computes coherenceGlow from data.coherence', () => {
    assert.ok(columnsBody.includes('coherenceGlow'), 'Should compute coherence glow');
    assert.ok(columnsBody.includes('data.coherence'), 'Should read coherence from data');
  });

  it('adds coherence glow to column opacity', () => {
    assert.ok(columnsBody.includes('coherenceGlow * 0.1'),
      'Should add coherenceGlow contribution to opacity');
  });

  it('_animateColumns receives data parameter', () => {
    assert.ok(
      sceneSrc.includes('_animateColumns(elapsed, beat, data)'),
      'Should pass data to _animateColumns'
    );
  });
});

// ─── Grid: HR-driven ripple intensity ───────────────────────────────────────

describe('Grid HR-driven ripple intensity', () => {
  it('computes ripple boost from HR', () => {
    assert.ok(gridBody.includes('rippleBoost'), 'Should compute ripple boost');
    assert.ok(gridBody.includes('hrFactor'), 'Should use hrFactor');
  });

  it('applies ripple boost to beat intensity', () => {
    assert.ok(gridBody.includes('beat * rippleBoost'),
      'Should multiply beat by ripple boost');
  });

  it('_animateGrid receives data parameter', () => {
    assert.ok(
      sceneSrc.includes('_animateGrid(elapsed, beat, data)'),
      'Should pass data to _animateGrid'
    );
  });
});

// ─── App.js: data flow integration ──────────────────────────────────────────

describe('app.js data flow to scene', () => {
  it('passes coherence in data to scene.update', () => {
    assert.ok(appSrc.includes('data.coherence'), 'Should compute coherence on data');
    assert.ok(appSrc.includes('scene.update(data)'), 'Should pass data to scene');
  });

  it('triggers beat on scene, audio, and HUD', () => {
    assert.ok(appSrc.includes('scene.triggerBeat()'), 'Should trigger scene beat');
    assert.ok(appSrc.includes('audio.playBeat'), 'Should play audio beat');
    assert.ok(appSrc.includes('hud.triggerBeat()'), 'Should trigger HUD beat');
  });

  it('gates beat triggers on signal quality', () => {
    assert.ok(
      appSrc.includes('data.quality > 0.3'),
      'Should require quality > 0.3 for beat triggers'
    );
  });

  it('passes data to hud.update', () => {
    assert.ok(appSrc.includes('hud.update(data)'), 'Should pass data to HUD');
  });
});

// ─── App.js: audio drone integration ──────────────────────────────────────

describe('app.js audio drone integration', () => {
  it('starts ambient drone on first heartbeat', () => {
    assert.ok(appSrc.includes('audio.startDrone()'), 'Should start drone');
    assert.ok(appSrc.includes('droneStarted'), 'Should track drone started state');
  });

  it('updates drone pitch with HR', () => {
    assert.ok(appSrc.includes('audio.updateDrone(data.hr)'), 'Should update drone with HR');
  });

  it('updates drone intensity with signal quality', () => {
    assert.ok(appSrc.includes('audio.updateDroneIntensity(data.quality)'),
      'Should update drone intensity with quality');
  });

  it('only starts drone once', () => {
    assert.ok(appSrc.includes('if (!droneStarted)'),
      'Should guard drone start with flag');
  });
});

// ─── Beat event propagation ─────────────────────────────────────────────────

describe('Beat event propagation', () => {
  it('onBeat sets beatIntensity to 1.0', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    mgr.init();
    mgr.beatIntensity = 0;
    mgr.onBeat = () => { mgr.beatIntensity = 1.0; };
    mgr.triggerBeat();
    assert.strictEqual(mgr.beatIntensity, 1.0);
  });

  it('beat intensity drives shader uniforms in source', () => {
    // Pulse ring
    assert.ok(pulseRingBody.includes('uBeatIntensity.value = beat'), 'Pulse ring should use beat');
    // Particles
    assert.ok(particlesBody.includes('uBeatIntensity.value = beat'), 'Particles should use beat');
    // Waveform
    assert.ok(waveformBody.includes('uBeatIntensity.value = beat'), 'Waveform should use beat');
    // Columns use flash (derived from beat)
    assert.ok(columnsBody.includes('uFlashIntensity.value = flash'), 'Columns should use flash');
    // Grid uses beat * rippleBoost
    assert.ok(gridBody.includes('beat * rippleBoost'), 'Grid should use beat * rippleBoost');
  });
});

// ─── Complete biometric parameter coverage ──────────────────────────────────

describe('All biometric parameters connected', () => {
  it('HR drives pulse ring radius, particle speed, and grid ripple', () => {
    assert.ok(pulseRingBody.includes('data.hr'), 'HR drives pulse ring radius');
    assert.ok(particlesBody.includes('data.hr'), 'HR drives particle speed');
    assert.ok(gridBody.includes('data.hr'), 'HR drives grid ripple');
  });

  it('HRV drives pulse ring color, particle color, and waveform breathing', () => {
    assert.ok(pulseRingBody.includes('data.hrv'), 'HRV drives pulse ring color');
    assert.ok(particlesBody.includes('data.hrv'), 'HRV drives particle color');
    assert.ok(waveformBody.includes('data.hrv'), 'HRV drives waveform breathing');
  });

  it('coherence drives column brightness', () => {
    assert.ok(columnsBody.includes('data.coherence'), 'Coherence drives column brightness');
  });

  it('quality drives particle color', () => {
    assert.ok(particlesBody.includes('data.quality'), 'Quality drives particle color');
  });

  it('pulse drives waveform Y-axis', () => {
    assert.ok(waveformBody.includes('data.pulse'), 'Pulse drives waveform');
    assert.ok(waveformBody.includes('_pulseHistory'), 'Pulse stored in history buffer');
  });

  it('beat triggers drive all five visual elements', () => {
    assert.ok(sceneSrc.includes('_animatePulseRing(elapsed, beat, data)'), 'Beat to pulse ring');
    assert.ok(sceneSrc.includes('_animateParticles(delta, beat, data)'), 'Beat to particles');
    assert.ok(sceneSrc.includes('_animateColumns(elapsed, beat, data)'), 'Beat to columns');
    assert.ok(sceneSrc.includes('_animateGrid(elapsed, beat, data)'), 'Beat to grid');
  });
});
