/**
 * Tests for the "awakening" animation — dramatic cathedral light-up
 * triggered on first heartbeat detection.
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
const cssSrc = readFileSync(resolve(root, 'css/style.css'), 'utf-8');

// ─── SceneManager awakening state ───────────────────────────────────────────

describe('SceneManager awakening initial state', () => {
  it('starts dormant (not awake)', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    assert.strictEqual(mgr._awake, false);
    assert.strictEqual(mgr._awakeningProgress, 0);
    assert.strictEqual(mgr._awakeningStartTime, null);
  });

  it('exposes awake getter returning false initially', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    assert.strictEqual(mgr.awake, false);
  });

  it('exposes awakeningProgress getter returning 0 initially', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    assert.strictEqual(mgr.awakeningProgress, 0);
  });
});

// ─── triggerAwakening ────────────────────────────────────────────────────────

describe('SceneManager.triggerAwakening', () => {
  it('sets _awake to true', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    mgr.init(); // sets _initialized, no THREE so clock is null
    mgr.triggerAwakening();
    assert.strictEqual(mgr._awake, true);
    assert.strictEqual(mgr.awake, true);
  });

  it('records awakening start time from clock', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    // Simulate a clock with getElapsedTime
    mgr.clock = { getElapsedTime: () => 5.0 };
    mgr.triggerAwakening();
    assert.strictEqual(mgr._awakeningStartTime, 5.0);
  });

  it('defaults start time to 0 when clock is null', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    mgr.clock = null;
    mgr.triggerAwakening();
    assert.strictEqual(mgr._awakeningStartTime, 0);
  });

  it('is idempotent — calling twice does not reset', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    mgr.clock = { getElapsedTime: () => 1.0 };
    mgr.triggerAwakening();
    assert.strictEqual(mgr._awakeningStartTime, 1.0);

    // Second call with later time should not override
    mgr.clock = { getElapsedTime: () => 5.0 };
    mgr.triggerAwakening();
    assert.strictEqual(mgr._awakeningStartTime, 1.0);
  });
});

// ─── _updateAwakening progress curve ────────────────────────────────────────

describe('SceneManager._updateAwakening', () => {
  it('does not update when not awake', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    mgr._updateAwakening(5.0);
    assert.strictEqual(mgr._awakeningProgress, 0);
  });

  it('does not update when already at 1', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    mgr._awake = true;
    mgr._awakeningStartTime = 0;
    mgr._awakeningProgress = 1;
    mgr._updateAwakening(10.0);
    assert.strictEqual(mgr._awakeningProgress, 1);
  });

  it('progresses from 0 toward 1 over 2 seconds', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    mgr._awake = true;
    mgr._awakeningStartTime = 0;

    // At t=0, progress should be 0
    mgr._updateAwakening(0);
    assert.strictEqual(mgr._awakeningProgress, 0);

    // At t=1 (halfway), progress should be >0 and <1
    mgr._awakeningProgress = 0; // reset for next call
    mgr._updateAwakening(1.0);
    assert.ok(mgr._awakeningProgress > 0, 'Should be > 0 at halfway');
    assert.ok(mgr._awakeningProgress < 1, 'Should be < 1 at halfway');

    // At t=2 (end), progress should be 1
    mgr._awakeningProgress = 0;
    mgr._updateAwakening(2.0);
    assert.strictEqual(mgr._awakeningProgress, 1);
  });

  it('uses ease-out cubic curve (fast start, slow end)', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    mgr._awake = true;
    mgr._awakeningStartTime = 0;

    // At t=0.5 (25%), ease-out cubic should be well past 0.25 linear
    mgr._updateAwakening(0.5);
    const early = mgr._awakeningProgress;
    assert.ok(early > 0.25, `Ease-out should be past 0.25 at 25% time, got ${early}`);

    // At t=1.0 (50%), should be significantly past 0.5 linear
    mgr._awakeningProgress = 0;
    mgr._updateAwakening(1.0);
    const mid = mgr._awakeningProgress;
    assert.ok(mid > 0.5, `Should be past 0.5 at 50% time, got ${mid}`);
  });

  it('clamps at 1 for times past duration', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    mgr._awake = true;
    mgr._awakeningStartTime = 0;

    mgr._updateAwakening(10.0);
    assert.strictEqual(mgr._awakeningProgress, 1);
  });

  it('respects awakening start time offset', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    mgr._awake = true;
    mgr._awakeningStartTime = 5.0;

    // At elapsed=5, should be 0 progress (just started)
    mgr._updateAwakening(5.0);
    assert.strictEqual(mgr._awakeningProgress, 0);

    // At elapsed=6, should be partway (1 second into 2-second duration)
    mgr._awakeningProgress = 0;
    mgr._updateAwakening(6.0);
    assert.ok(mgr._awakeningProgress > 0);
    assert.ok(mgr._awakeningProgress < 1);

    // At elapsed=7, should be at 1 (2 seconds complete)
    mgr._awakeningProgress = 0;
    mgr._updateAwakening(7.0);
    assert.strictEqual(mgr._awakeningProgress, 1);
  });
});

// ─── _staggeredAwake ─────────────────────────────────────────────────────────

describe('SceneManager._staggeredAwake', () => {
  it('returns 1 when global progress is 1', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    assert.strictEqual(mgr._staggeredAwake(1, 0), 1);
    assert.strictEqual(mgr._staggeredAwake(1, 0.5), 1);
    assert.strictEqual(mgr._staggeredAwake(1, 1), 1);
  });

  it('returns 0 when global progress is 0', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    assert.strictEqual(mgr._staggeredAwake(0, 0), 0);
    assert.strictEqual(mgr._staggeredAwake(0, 0.5), 0);
  });

  it('delay=0 elements track global progress directly', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    assert.strictEqual(mgr._staggeredAwake(0.5, 0), 0.5);
    assert.strictEqual(mgr._staggeredAwake(0.8, 0), 0.8);
  });

  it('higher delay elements start later', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    const aw = 0.3;
    const noDelay = mgr._staggeredAwake(aw, 0);
    const midDelay = mgr._staggeredAwake(aw, 0.5);
    const highDelay = mgr._staggeredAwake(aw, 0.8);
    assert.ok(noDelay >= midDelay, 'Lower delay should be farther along');
    assert.ok(midDelay >= highDelay, 'Mid delay should be farther than high delay');
  });

  it('returns 0 for high delay when global progress is small', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    // With delay=0.8 and aw=0.1, local should be 0
    const result = mgr._staggeredAwake(0.1, 0.8);
    assert.strictEqual(result, 0);
  });

  it('clamps output between 0 and 1', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    for (let aw = 0; aw <= 1; aw += 0.1) {
      for (let delay = 0; delay <= 1; delay += 0.1) {
        const result = mgr._staggeredAwake(aw, delay);
        assert.ok(result >= 0, `Should be >= 0 for aw=${aw}, delay=${delay}`);
        assert.ok(result <= 1, `Should be <= 1 for aw=${aw}, delay=${delay}`);
      }
    }
  });
});

// ─── Awakening modulates visual element opacity ─────────────────────────────

describe('Awakening modulates visual elements in source', () => {
  it('pulse ring opacity is multiplied by localAw', () => {
    assert.ok(sceneSrc.includes('* localAw'), 'Should multiply opacity by local awakening');
  });

  it('pulse ring has dormant scale factor', () => {
    assert.ok(sceneSrc.includes('awScale'), 'Should compute awakening scale');
    assert.ok(sceneSrc.includes('0.3 + localAw * 0.7'), 'Should start small and expand');
  });

  it('particles use staggered awakening delay=0.2', () => {
    assert.ok(
      sceneSrc.includes("_staggeredAwake(aw, 0.2)"),
      'Particles should use delay 0.2'
    );
  });

  it('waveform uses staggered awakening delay=0.3', () => {
    assert.ok(
      sceneSrc.includes("_staggeredAwake(aw, 0.3)"),
      'Waveform should use delay 0.3'
    );
  });

  it('columns use staggered awakening delay=0.5', () => {
    assert.ok(
      sceneSrc.includes("_staggeredAwake(aw, 0.5)"),
      'Columns should use delay 0.5'
    );
  });

  it('grid uses staggered awakening delay=0.6', () => {
    assert.ok(
      sceneSrc.includes("_staggeredAwake(aw, 0.6)"),
      'Grid should use delay 0.6'
    );
  });

  it('stagger order: pulse ring < particles < waveform < columns < grid', () => {
    // Extract delay values from source
    const pulseDelay = 0;    // delay=0 for pulse ring
    const particleDelay = 0.2;
    const waveformDelay = 0.3;
    const columnDelay = 0.5;
    const gridDelay = 0.6;
    assert.ok(pulseDelay < particleDelay, 'Pulse ring should wake before particles');
    assert.ok(particleDelay < waveformDelay, 'Particles should wake before waveform');
    assert.ok(waveformDelay < columnDelay, 'Waveform should wake before columns');
    assert.ok(columnDelay < gridDelay, 'Columns should wake before grid');
  });

  it('columns have per-column stagger during awakening', () => {
    assert.ok(sceneSrc.includes('columnAw'), 'Should compute per-column awakening');
    assert.ok(sceneSrc.includes('baseAw * COLUMN_COUNT - i'), 'Should stagger by column index');
  });
});

// ─── _render integrates awakening ───────────────────────────────────────────

describe('_render calls _updateAwakening', () => {
  it('calls _updateAwakening in _render', () => {
    assert.ok(sceneSrc.includes('this._updateAwakening(elapsed)'),
      'Should update awakening progress each frame');
  });

  it('passes awakening progress to all animate methods', () => {
    assert.ok(sceneSrc.includes('_animatePulseRing(elapsed, beat, data, aw)'));
    assert.ok(sceneSrc.includes('_animateParticles(delta, beat, data, aw)'));
    assert.ok(sceneSrc.includes('_animateWaveform(elapsed, data, aw)'));
    assert.ok(sceneSrc.includes('_animateColumns(elapsed, beat, data, aw)'));
    assert.ok(sceneSrc.includes('_animateGrid(elapsed, beat, data, aw)'));
  });
});

// ─── app.js triggers awakening on first heartbeat ───────────────────────────

describe('app.js triggers awakening on first heartbeat', () => {
  it('calls scene.triggerAwakening() on first beat', () => {
    assert.ok(appSrc.includes('scene.triggerAwakening()'),
      'Should trigger awakening on first heartbeat');
  });

  it('awakening is inside the droneStarted guard', () => {
    const guardIdx = appSrc.indexOf('if (!droneStarted)');
    const awakeningIdx = appSrc.indexOf('scene.triggerAwakening()');
    const guardEnd = appSrc.indexOf('}', awakeningIdx);
    assert.ok(guardIdx < awakeningIdx, 'Awakening should be inside droneStarted guard');
    assert.ok(guardEnd > awakeningIdx, 'Awakening should be before guard closing brace');
  });

  it('adds awake class to HUD element', () => {
    assert.ok(appSrc.includes("classList.add('awake')"),
      'Should add awake class to HUD');
  });
});

// ─── CSS awakening styles ────────────────────────────────────────────────────

describe('CSS awakening styles', () => {
  it('HUD starts with opacity 0 (dormant)', () => {
    // Find the #hud rule (not #hud.awake)
    const hudRule = cssSrc.substring(cssSrc.indexOf('#hud {'), cssSrc.indexOf('#hud.awake'));
    assert.ok(hudRule.includes('opacity: 0'), 'HUD should start transparent');
  });

  it('HUD transitions to visible with awake class', () => {
    assert.ok(cssSrc.includes('#hud.awake'), 'Should have #hud.awake rule');
    const awakeRule = cssSrc.substring(cssSrc.indexOf('#hud.awake'));
    assert.ok(awakeRule.includes('opacity: 1'), 'Awake HUD should be fully visible');
  });

  it('HUD opacity has a CSS transition', () => {
    const hudRule = cssSrc.substring(cssSrc.indexOf('#hud {'), cssSrc.indexOf('#hud.awake'));
    assert.ok(hudRule.includes('transition'), 'Should have CSS transition');
    assert.ok(hudRule.includes('opacity'), 'Transition should include opacity');
  });
});
