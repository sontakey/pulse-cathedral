import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// ─── app.js source validation ────────────────────────────────────────────────



describe('CSS polish transitions', () => {
  const css = readFileSync(resolve(root, 'css/style.css'), 'utf-8');

  it('has smooth HUD opacity transition', () => {
    assert.ok(
      css.includes('transition: opacity'),
      'HUD should have opacity transition'
    );
  });

  it('has dimmed class for HUD', () => {
    assert.ok(css.includes('#hud.dimmed'), 'Should define dimmed state');
    assert.ok(css.includes('opacity: 0.3'), 'Dimmed opacity should be 0.3');
  });

  it('has smooth status overlay transition', () => {
    const statusSection = css.substring(css.indexOf('#status-overlay'));
    assert.ok(
      statusSection.includes('transition: opacity'),
      'Status overlay should have opacity transition'
    );
  });

  it('has smooth signal fill transitions', () => {
    const signalSection = css.substring(css.indexOf('#signal-fill'));
    assert.ok(
      signalSection.includes('transition:'),
      'Signal fill should have transitions'
    );
    assert.ok(
      signalSection.includes('background-color'),
      'Signal fill should transition background color'
    );
  });

  it('has smooth coherence bar transition', () => {
    const coherenceSection = css.substring(css.indexOf('#coherence-fill'));
    assert.ok(
      coherenceSection.includes('transition: width'),
      'Coherence fill should transition width'
    );
  });

  it('has smooth pulse dot beat transition', () => {
    const pulseDot = css.substring(css.indexOf('#pulse-dot'));
    assert.ok(
      pulseDot.includes('transition:'),
      'Pulse dot should have transitions'
    );
  });

  it('has smooth tap overlay fade', () => {
    const tapSection = css.substring(css.indexOf('#tap-overlay'));
    assert.ok(
      tapSection.includes('transition: opacity'),
      'Tap overlay should fade smoothly'
    );
  });

  it('has smooth breathing guide transition', () => {
    const breathingSection = css.substring(css.indexOf('#breathing-guide'));
    assert.ok(
      breathingSection.includes('transition: opacity'),
      'Breathing guide should fade smoothly'
    );
  });
});

// ─── Scene performance optimizations ─────────────────────────────────────────

describe('scene.js performance optimizations', () => {
  const src = readFileSync(resolve(root, 'js/scene.js'), 'utf-8');

  it('pre-allocates Color objects for particle animation', () => {
    assert.ok(src.includes('_tealColor'), 'Should have pre-allocated teal color');
    assert.ok(src.includes('_warmColor'), 'Should have pre-allocated warm color');
    assert.ok(src.includes('_poorColor'), 'Should have pre-allocated poor color');
    assert.ok(src.includes('_tmpColor'), 'Should have pre-allocated temp color');
  });

  it('reuses color objects instead of allocating in animation loop', () => {
    // The _animateParticles method should NOT create new THREE.Color inside the loop
    const animSection = src.substring(src.indexOf('_animateParticles'));
    const animEnd = animSection.indexOf('_animateWaveform');
    const animBody = animSection.substring(0, animEnd);

    assert.ok(
      !animBody.includes('new THREE.Color'),
      'Should not allocate new Color objects in particle animation loop'
    );
  });

  it('initializes color objects in init()', () => {
    // Colors should be created in init() where THREE is available
    const initSection = src.substring(src.indexOf('init()'));
    const initEnd = initSection.indexOf('_buildPulseRing');
    const initBody = initSection.substring(0, initEnd);

    assert.ok(
      initBody.includes('_tealColor = new THREE.Color'),
      'Should initialize teal color in init()'
    );
    assert.ok(
      initBody.includes('_warmColor = new THREE.Color'),
      'Should initialize warm color in init()'
    );
  });

  it('uses copy() and lerp() for color blending', () => {
    const animSection = src.substring(src.indexOf('_animateParticles'));
    assert.ok(
      animSection.includes('.copy('),
      'Should use copy() instead of clone()'
    );
    assert.ok(
      animSection.includes('.lerp('),
      'Should use lerp() for color blending'
    );
  });
});

// ─── SceneManager pre-allocated colors in Node (no THREE) ────────────────────

describe('SceneManager color initialization without THREE', () => {
  it('sets color fields to null in constructor', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    assert.strictEqual(mgr._tealColor, null);
    assert.strictEqual(mgr._warmColor, null);
    assert.strictEqual(mgr._poorColor, null);
    assert.strictEqual(mgr._tmpColor, null);
  });

  it('colors remain null after init without THREE', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    mgr.init();
    // Without THREE global, init returns early — colors stay null
    assert.strictEqual(mgr._tealColor, null);
  });
});

// ─── Awakening animation ─────────────────────────────────────────────────────

describe('SceneManager awakening transitions', () => {
  it('starts with dormant state', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    assert.strictEqual(mgr.awake, false);
    assert.strictEqual(mgr.awakeningProgress, 0);
  });

  it('triggerAwakening sets awake flag', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    mgr.init();
    mgr.triggerAwakening();
    assert.strictEqual(mgr.awake, true);
  });

  it('triggerAwakening is idempotent', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    mgr.init();
    mgr.triggerAwakening();
    const startTime = mgr._awakeningStartTime;
    mgr.triggerAwakening();
    assert.strictEqual(mgr._awakeningStartTime, startTime, 'Should not reset start time');
  });

  it('staggeredAwake returns 0 for dormant state', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    assert.strictEqual(mgr._staggeredAwake(0, 0), 0);
    assert.strictEqual(mgr._staggeredAwake(0, 0.5), 0);
  });

  it('staggeredAwake returns 1 for fully awake state', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    assert.strictEqual(mgr._staggeredAwake(1, 0), 1);
    assert.strictEqual(mgr._staggeredAwake(1, 0.5), 1);
    assert.strictEqual(mgr._staggeredAwake(1, 1), 1);
  });

  it('staggeredAwake applies delay correctly', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    // At aw=0.5 with delay=0, should be partially awake
    const noDelay = mgr._staggeredAwake(0.5, 0);
    // At aw=0.5 with delay=0.5, should be less awake
    const withDelay = mgr._staggeredAwake(0.5, 0.5);
    assert.ok(noDelay >= withDelay, 'Higher delay should produce lower awakening');
  });
});

// ─── HUD smoothing ───────────────────────────────────────────────────────────

describe('HUD smoothing for polish', () => {
  it('uses exponential moving average', async () => {
    const { HUD } = await import('../js/hud.js');
    const hud = new HUD({
      hrValue: { textContent: '' },
      hrvValue: { textContent: '' },
      coherenceValue: { textContent: '' },
      coherenceBar: { style: {} },
      signalFill: { style: {} },
      qualityText: { textContent: '' },
      pulseDot: { classList: { add() {}, remove() {} } },
      sparkline: null,
    });

    // Feed two very different HR values
    hud.update({ hr: 60, hrv: null, quality: 0, pulse: 0 });
    const after60 = hud._smoothHR;
    hud.update({ hr: 100, hrv: null, quality: 0, pulse: 0 });
    const after100 = hud._smoothHR;

    // Smoothed value should be between 60 and 100 (not jump to 100)
    assert.ok(after100 > after60, 'Should increase toward new value');
    assert.ok(after100 < 100, 'Should not jump directly to new value');
  });

  it('reset clears smoothed values', async () => {
    const { HUD } = await import('../js/hud.js');
    const hud = new HUD({
      hrValue: { textContent: '' },
      hrvValue: { textContent: '' },
      coherenceValue: { textContent: '' },
      coherenceBar: { style: {} },
      signalFill: { style: {} },
      qualityText: { textContent: '' },
      pulseDot: { classList: { add() {}, remove() {} } },
      sparkline: null,
    });

    hud.update({ hr: 72, hrv: 50, quality: 0.8, coherence: 80, pulse: 0 });
    hud.reset();
    assert.strictEqual(hud._smoothHR, null);
    assert.strictEqual(hud._smoothHRV, null);
    assert.strictEqual(hud._smoothQuality, 0);
    assert.strictEqual(hud._smoothCoherence, 0);
  });
});

// ─── Audio edge cases ────────────────────────────────────────────────────────

describe('AudioManager edge cases', () => {
  it('stopDrone is safe to call when not running', async () => {
    const { AudioManager } = await import('../js/audio.js');
    const mgr = new AudioManager();
    // Should not throw
    mgr.stopDrone();
  });

  it('startDrone is safe to call before init', async () => {
    const { AudioManager } = await import('../js/audio.js');
    const mgr = new AudioManager();
    // Should not throw
    mgr.startDrone();
    assert.strictEqual(mgr._droneRunning, false);
  });

  it('updateDrone is safe when drone not running', async () => {
    const { AudioManager } = await import('../js/audio.js');
    const mgr = new AudioManager();
    // Should not throw
    mgr.updateDrone(72);
    assert.strictEqual(mgr._currentHR, 72);
  });

  it('updateDroneIntensity is safe when drone not running', async () => {
    const { AudioManager } = await import('../js/audio.js');
    const mgr = new AudioManager();
    // Should not throw
    mgr.updateDroneIntensity(0.5);
  });

  it('dispose is safe to call without init', async () => {
    const { AudioManager } = await import('../js/audio.js');
    const mgr = new AudioManager();
    // Should not throw
    mgr.dispose();
    assert.strictEqual(mgr._initialized, false);
  });
});

// ─── Breathing guide edge cases ──────────────────────────────────────────────

describe('BreathingGuide edge cases', () => {
  it('deactivate is safe when not active', async () => {
    const { BreathingGuide } = await import('../js/breathing.js');
    const bg = new BreathingGuide({ container: null, circle: null, label: null, timer: null });
    bg.deactivate();
    assert.strictEqual(bg.active, false);
  });

  it('getBreathingData returns null when not active', async () => {
    const { BreathingGuide } = await import('../js/breathing.js');
    const bg = new BreathingGuide({ container: null, circle: null, label: null, timer: null });
    assert.strictEqual(bg.getBreathingData(), null);
  });

  it('checkStability resets on null HR', async () => {
    const { BreathingGuide } = await import('../js/breathing.js');
    const bg = new BreathingGuide({ container: null, circle: null, label: null, timer: null });
    // Build some stability
    for (let i = 0; i < 5; i++) bg.checkStability(72);
    // Null HR should reset
    bg.checkStability(null);
    assert.strictEqual(bg._stableCount, 0);
  });
});

// ─── RPPGProcessor edge cases ────────────────────────────────────────────────
