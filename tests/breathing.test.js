import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

import {
  BreathingGuide,
  INHALE_DURATION,
  HOLD_DURATION,
  EXHALE_DURATION,
  CYCLE_DURATION,
  STABILITY_THRESHOLD,
  STABILITY_RANGE,
  PHASE_INHALE,
  PHASE_HOLD,
  PHASE_EXHALE,
} from '../js/breathing.js';

/** Create mock DOM elements for testing. */
function mockElements() {
  return {
    container: {
      _classes: new Set(),
      classList: {
        add(cls) { this._el._classes.add(cls); },
        remove(cls) { this._el._classes.delete(cls); },
        contains(cls) { return this._el._classes.has(cls); },
      },
    },
    circle: { style: { transform: '' } },
    label: { textContent: '' },
    timer: { textContent: '' },
  };
}

function setup() {
  const els = mockElements();
  els.container.classList._el = els.container;
  return { els, guide: new BreathingGuide(els) };
}

// ─── Constants ────────────────────────────────────────────────────────────────

describe('Breathing guide constants', () => {
  it('4-7-8 breathing timing', () => {
    assert.strictEqual(INHALE_DURATION, 4);
    assert.strictEqual(HOLD_DURATION, 7);
    assert.strictEqual(EXHALE_DURATION, 8);
    assert.strictEqual(CYCLE_DURATION, 19);
  });

  it('stability constants', () => {
    assert.strictEqual(STABILITY_THRESHOLD, 10);
    assert.strictEqual(STABILITY_RANGE, 5);
  });

  it('phase names', () => {
    assert.strictEqual(PHASE_INHALE, 'inhale');
    assert.strictEqual(PHASE_HOLD, 'hold');
    assert.strictEqual(PHASE_EXHALE, 'exhale');
  });
});

// ─── Construction ─────────────────────────────────────────────────────────────

describe('BreathingGuide construction', () => {
  it('can be constructed with mock elements', () => {
    const { guide } = setup();
    assert.ok(guide);
    assert.strictEqual(guide.active, false);
    assert.strictEqual(guide.phase, PHASE_INHALE);
  });

  it('starts inactive', () => {
    const { guide } = setup();
    assert.strictEqual(guide._active, false);
    assert.strictEqual(guide._cycleStart, null);
    assert.strictEqual(guide._stableCount, 0);
  });
});

// ─── Phase computation ────────────────────────────────────────────────────────

describe('BreathingGuide.computePhase', () => {
  it('returns inhale at start of cycle', () => {
    const result = BreathingGuide.computePhase(0);
    assert.strictEqual(result.phase, PHASE_INHALE);
    assert.strictEqual(result.progress, 0);
    assert.strictEqual(result.remaining, 4);
  });

  it('returns inhale midway through inhale', () => {
    const result = BreathingGuide.computePhase(2);
    assert.strictEqual(result.phase, PHASE_INHALE);
    assert.strictEqual(result.progress, 0.5);
    assert.strictEqual(result.remaining, 2);
  });

  it('returns hold at inhale boundary', () => {
    const result = BreathingGuide.computePhase(4);
    assert.strictEqual(result.phase, PHASE_HOLD);
    assert.strictEqual(result.progress, 0);
    assert.strictEqual(result.remaining, 7);
  });

  it('returns hold midway', () => {
    const result = BreathingGuide.computePhase(7.5);
    assert.strictEqual(result.phase, PHASE_HOLD);
    assert.ok(result.progress > 0.4 && result.progress < 0.6);
    assert.strictEqual(result.remaining, 4);
  });

  it('returns exhale at hold boundary', () => {
    const result = BreathingGuide.computePhase(11);
    assert.strictEqual(result.phase, PHASE_EXHALE);
    assert.strictEqual(result.progress, 0);
    assert.strictEqual(result.remaining, 8);
  });

  it('returns exhale midway', () => {
    const result = BreathingGuide.computePhase(15);
    assert.strictEqual(result.phase, PHASE_EXHALE);
    assert.strictEqual(result.progress, 0.5);
    assert.strictEqual(result.remaining, 4);
  });

  it('wraps around after full cycle', () => {
    const result = BreathingGuide.computePhase(19);
    assert.strictEqual(result.phase, PHASE_INHALE);
    assert.strictEqual(result.progress, 0);
  });

  it('wraps around multiple cycles', () => {
    const result = BreathingGuide.computePhase(38); // 2 full cycles
    assert.strictEqual(result.phase, PHASE_INHALE);
    assert.strictEqual(result.progress, 0);
  });
});

// ─── Circle scale ─────────────────────────────────────────────────────────────

describe('BreathingGuide.circleScale', () => {
  it('starts at 0.3 for inhale progress=0', () => {
    const scale = BreathingGuide.circleScale(PHASE_INHALE, 0);
    assert.strictEqual(scale, 0.3);
  });

  it('reaches 1.0 for inhale progress=1', () => {
    const scale = BreathingGuide.circleScale(PHASE_INHALE, 1);
    assert.ok(Math.abs(scale - 1.0) < 0.001);
  });

  it('is 1.0 during hold', () => {
    assert.strictEqual(BreathingGuide.circleScale(PHASE_HOLD, 0), 1.0);
    assert.strictEqual(BreathingGuide.circleScale(PHASE_HOLD, 0.5), 1.0);
    assert.strictEqual(BreathingGuide.circleScale(PHASE_HOLD, 1), 1.0);
  });

  it('starts at 1.0 for exhale progress=0', () => {
    const scale = BreathingGuide.circleScale(PHASE_EXHALE, 0);
    assert.strictEqual(scale, 1.0);
  });

  it('reaches 0.3 for exhale progress=1', () => {
    const scale = BreathingGuide.circleScale(PHASE_EXHALE, 1);
    assert.ok(Math.abs(scale - 0.3) < 0.001);
  });

  it('inhale uses ease-out (faster start)', () => {
    const midScale = BreathingGuide.circleScale(PHASE_INHALE, 0.5);
    // Ease-out means 50% time yields > 50% progress (> 0.65 midpoint)
    assert.ok(midScale > 0.65, `Expected ease-out midpoint > 0.65, got ${midScale}`);
  });

  it('exhale uses ease-in (slower start)', () => {
    const midScale = BreathingGuide.circleScale(PHASE_EXHALE, 0.5);
    // Ease-in means 50% time yields < 50% scale change (> 0.65 still large)
    assert.ok(midScale > 0.65, `Expected ease-in midpoint > 0.65, got ${midScale}`);
  });

  it('scale is always between 0.3 and 1.0', () => {
    for (const phase of [PHASE_INHALE, PHASE_HOLD, PHASE_EXHALE]) {
      for (let p = 0; p <= 1; p += 0.1) {
        const scale = BreathingGuide.circleScale(phase, p);
        assert.ok(scale >= 0.3 - 0.001, `Scale ${scale} below 0.3 for ${phase} at ${p}`);
        assert.ok(scale <= 1.0 + 0.001, `Scale ${scale} above 1.0 for ${phase} at ${p}`);
      }
    }
  });
});

// ─── HR stability detection ──────────────────────────────────────────────────

describe('BreathingGuide stability', () => {
  it('returns false for null HR', () => {
    const { guide } = setup();
    assert.strictEqual(guide.checkStability(null), false);
    assert.strictEqual(guide._stableCount, 0);
  });

  it('resets count on null HR', () => {
    const { guide } = setup();
    guide.checkStability(72);
    guide.checkStability(72);
    guide.checkStability(null);
    assert.strictEqual(guide._stableCount, 0);
  });

  it('counts consecutive stable readings', () => {
    const { guide } = setup();
    for (let i = 0; i < 5; i++) {
      guide.checkStability(72);
    }
    assert.strictEqual(guide._stableCount, 5);
  });

  it('allows readings within STABILITY_RANGE', () => {
    const { guide } = setup();
    guide.checkStability(72);
    guide.checkStability(75); // within 5 BPM
    assert.strictEqual(guide._stableCount, 2);
  });

  it('resets count on large HR change', () => {
    const { guide } = setup();
    for (let i = 0; i < 5; i++) guide.checkStability(72);
    guide.checkStability(85); // > 5 BPM change
    assert.strictEqual(guide._stableCount, 1);
  });

  it('returns true after STABILITY_THRESHOLD readings', () => {
    const { guide } = setup();
    for (let i = 0; i < STABILITY_THRESHOLD - 1; i++) {
      assert.strictEqual(guide.checkStability(72), false);
    }
    assert.strictEqual(guide.checkStability(72), true);
  });
});

// ─── Activate / Deactivate ───────────────────────────────────────────────────

describe('BreathingGuide activate/deactivate', () => {
  it('activate sets active state and shows container', () => {
    const { guide, els } = setup();
    // Provide performance.now for Node
    globalThis.performance = globalThis.performance || { now: () => Date.now() };
    globalThis.requestAnimationFrame = () => 1;
    guide.activate();
    assert.strictEqual(guide.active, true);
    assert.ok(els.container._classes.has('visible'));
    globalThis.cancelAnimationFrame = () => {};
    guide.deactivate();
    delete globalThis.cancelAnimationFrame;
  });

  it('activate is idempotent', () => {
    const { guide } = setup();
    globalThis.requestAnimationFrame = () => 1;
    guide.activate();
    const start = guide._cycleStart;
    guide.activate(); // should not reset
    assert.strictEqual(guide._cycleStart, start);
    globalThis.cancelAnimationFrame = () => {};
    guide.deactivate();
    delete globalThis.cancelAnimationFrame;
  });

  it('deactivate clears state and hides container', () => {
    const { guide, els } = setup();
    globalThis.requestAnimationFrame = () => 1;
    guide.activate();
    globalThis.cancelAnimationFrame = () => {};
    guide.deactivate();
    assert.strictEqual(guide.active, false);
    assert.strictEqual(guide._cycleStart, null);
    assert.ok(!els.container._classes.has('visible'));
    delete globalThis.cancelAnimationFrame;
  });

  it('deactivate is idempotent', () => {
    const { guide } = setup();
    guide.deactivate(); // should not throw
    assert.strictEqual(guide.active, false);
  });
});

// ─── Toggle ──────────────────────────────────────────────────────────────────

describe('BreathingGuide toggle', () => {
  it('toggle activates when inactive', () => {
    const { guide } = setup();
    globalThis.requestAnimationFrame = () => 1;
    guide.toggle();
    assert.strictEqual(guide.active, true);
    globalThis.cancelAnimationFrame = () => {};
    guide.deactivate();
    delete globalThis.cancelAnimationFrame;
  });

  it('toggle deactivates when active', () => {
    const { guide } = setup();
    globalThis.requestAnimationFrame = () => 1;
    guide.toggle(); // activate
    globalThis.cancelAnimationFrame = () => {};
    guide.toggle(); // deactivate
    assert.strictEqual(guide.active, false);
    delete globalThis.cancelAnimationFrame;
  });
});

// ─── updateFromData auto-activation ──────────────────────────────────────────

describe('BreathingGuide updateFromData', () => {
  it('activates after STABILITY_THRESHOLD stable readings', () => {
    const { guide } = setup();
    globalThis.requestAnimationFrame = () => 1;
    for (let i = 0; i < STABILITY_THRESHOLD; i++) {
      guide.updateFromData({ hr: 72 });
    }
    assert.strictEqual(guide.active, true);
    globalThis.cancelAnimationFrame = () => {};
    guide.deactivate();
    delete globalThis.cancelAnimationFrame;
  });

  it('does not activate with unstable HR', () => {
    const { guide } = setup();
    for (let i = 0; i < 20; i++) {
      guide.updateFromData({ hr: 60 + i * 10 }); // jumping 10 BPM each time
    }
    assert.strictEqual(guide.active, false);
  });
});

// ─── getBreathingData ────────────────────────────────────────────────────────

describe('BreathingGuide getBreathingData', () => {
  it('returns null when inactive', () => {
    const { guide } = setup();
    assert.strictEqual(guide.getBreathingData(), null);
  });

  it('returns breathing data when active', () => {
    const { guide } = setup();
    globalThis.requestAnimationFrame = () => 1;
    guide.activate();
    const data = guide.getBreathingData();
    assert.ok(data);
    assert.strictEqual(data.active, true);
    assert.ok(['inhale', 'hold', 'exhale'].includes(data.phase));
    assert.ok(typeof data.scale === 'number');
    assert.ok(typeof data.progress === 'number');
    globalThis.cancelAnimationFrame = () => {};
    guide.deactivate();
    delete globalThis.cancelAnimationFrame;
  });
});

// ─── Null-safe element handling ──────────────────────────────────────────────

describe('BreathingGuide null elements', () => {
  it('handles null elements gracefully', () => {
    const guide = new BreathingGuide({
      container: null,
      circle: null,
      label: null,
      timer: null,
    });
    globalThis.requestAnimationFrame = () => 1;
    guide.activate();
    assert.strictEqual(guide.active, true);
    globalThis.cancelAnimationFrame = () => {};
    guide.deactivate();
    delete globalThis.cancelAnimationFrame;
  });
});

// ─── Source code validation ──────────────────────────────────────────────────

describe('breathing.js source structure', () => {
  const src = readFileSync(resolve(root, 'js/breathing.js'), 'utf-8');

  it('exports BreathingGuide class and createBreathingGuide factory', () => {
    assert.ok(src.includes('export class BreathingGuide'));
    assert.ok(src.includes('export function createBreathingGuide'));
  });

  it('defines 4-7-8 timing constants', () => {
    assert.ok(src.includes('INHALE_DURATION'));
    assert.ok(src.includes('HOLD_DURATION'));
    assert.ok(src.includes('EXHALE_DURATION'));
    assert.ok(src.includes('CYCLE_DURATION'));
  });

  it('defines phase names', () => {
    assert.ok(src.includes('PHASE_INHALE'));
    assert.ok(src.includes('PHASE_HOLD'));
    assert.ok(src.includes('PHASE_EXHALE'));
  });

  it('has static computePhase method', () => {
    assert.ok(src.includes('static computePhase'));
  });

  it('has static circleScale method', () => {
    assert.ok(src.includes('static circleScale'));
  });
});



describe('style.css has breathing guide styles', () => {
  const css = readFileSync(resolve(root, 'css/style.css'), 'utf-8');

  it('styles breathing-guide container', () => {
    assert.ok(css.includes('#breathing-guide'));
  });

  it('styles breathing-circle', () => {
    assert.ok(css.includes('#breathing-circle'));
  });

  it('has visible class for showing guide', () => {
    assert.ok(css.includes('#breathing-guide.visible'));
  });
});

describe('scene.js responds to breathing data', () => {
  const sceneSrc = readFileSync(resolve(root, 'js/scene.js'), 'utf-8');

  it('references breathing data in pulse ring animation', () => {
    assert.ok(sceneSrc.includes('breathingData'));
    assert.ok(sceneSrc.includes('breatheGuide'));
  });

  it('dampens particle speed during breathing', () => {
    assert.ok(sceneSrc.includes('breathingDampen'));
  });

  it('syncs column glow to breathing', () => {
    assert.ok(sceneSrc.includes('breathingData.scale'));
  });
});
