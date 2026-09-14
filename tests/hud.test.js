import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

import { HUD } from '../js/hud.js';

/** Create mock DOM elements for testing. */
function mockElements() {
  return {
    hrValue: { textContent: '--' },
    hrvValue: { textContent: '--' },
    coherenceValue: { textContent: '--' },
    coherenceBar: { style: { width: '0%' } },
    signalFill: { style: { width: '0%', backgroundColor: '' } },
    qualityText: { textContent: '0%' },
    pulseDot: {
      _classes: new Set(),
      classList: {
        add(cls) { this._el._classes.add(cls); },
        remove(cls) { this._el._classes.delete(cls); },
      },
    },
    sparkline: null,
  };
}

function setup() {
  const els = mockElements();
  // Wire classList back-reference
  els.pulseDot.classList._el = els.pulseDot;
  return { els, hud: new HUD(els) };
}

// ─── Construction ────────────────────────────────────────────────────────────

describe('HUD construction', () => {
  it('can be constructed with mock elements', () => {
    const { hud } = setup();
    assert.ok(hud);
    assert.deepStrictEqual(hud.bpmHistory, []);
  });

  it('initializes smoothed values to null/zero', () => {
    const { hud } = setup();
    assert.strictEqual(hud._smoothHR, null);
    assert.strictEqual(hud._smoothHRV, null);
    assert.strictEqual(hud._smoothQuality, 0);
    assert.strictEqual(hud._smoothCoherence, 0);
  });
});

// ─── Heart rate display ──────────────────────────────────────────────────────

describe('HUD heart rate', () => {
  it('displays rounded HR value', () => {
    const { hud, els } = setup();
    hud.update({ hr: 72.4, hrv: null, quality: 0.5, pulse: 0 });
    assert.strictEqual(String(els.hrValue.textContent), '72');
  });

  it('ignores null HR', () => {
    const { hud, els } = setup();
    hud.update({ hr: null, hrv: null, quality: 0, pulse: 0 });
    assert.strictEqual(els.hrValue.textContent, '--');
  });

  it('smooths HR over multiple updates', () => {
    const { hud, els } = setup();
    // First update sets smoothed value directly
    hud.update({ hr: 60, hrv: null, quality: 0, pulse: 0 });
    assert.strictEqual(String(els.hrValue.textContent), '60');

    // Second update should smooth toward 80
    hud.update({ hr: 80, hrv: null, quality: 0, pulse: 0 });
    const displayed = parseInt(String(els.hrValue.textContent), 10);
    assert.ok(displayed > 60, `Should move toward 80, got ${displayed}`);
    assert.ok(displayed < 80, `Should not jump to 80, got ${displayed}`);
  });
});

// ─── HRV display ─────────────────────────────────────────────────────────────

describe('HUD HRV', () => {
  it('displays rounded HRV value', () => {
    const { hud, els } = setup();
    hud.update({ hr: null, hrv: 42.7, quality: 0, pulse: 0 });
    assert.strictEqual(String(els.hrvValue.textContent), '43');
  });

  it('ignores null HRV', () => {
    const { hud, els } = setup();
    hud.update({ hr: null, hrv: null, quality: 0, pulse: 0 });
    assert.strictEqual(els.hrvValue.textContent, '--');
  });
});

// ─── Signal quality ──────────────────────────────────────────────────────────

describe('HUD signal quality', () => {
  it('updates signal bar width', () => {
    const { hud, els } = setup();
    hud.update({ hr: null, hrv: null, quality: 0.8, pulse: 0 });
    // With smoothing, won't be exactly 80%, but should be > 0%
    const pct = parseInt(els.signalFill.style.width, 10);
    assert.ok(pct > 0, `Expected positive width, got ${pct}`);
  });

  it('uses amber color for poor quality', () => {
    const { hud, els } = setup();
    hud.update({ hr: null, hrv: null, quality: 0.1, pulse: 0 });
    assert.strictEqual(els.signalFill.style.backgroundColor, '#ffb703');
  });

  it('uses teal color for good quality', () => {
    const { hud, els } = setup();
    // Push quality high enough to pass threshold after smoothing
    for (let i = 0; i < 20; i++) {
      hud.update({ hr: null, hrv: null, quality: 0.9, pulse: 0 });
    }
    assert.strictEqual(els.signalFill.style.backgroundColor, '#00f5d4');
  });

  it('updates quality percentage text', () => {
    const { hud, els } = setup();
    hud.update({ hr: null, hrv: null, quality: 0.5, pulse: 0 });
    const pct = parseInt(els.qualityText.textContent, 10);
    assert.ok(pct > 0, `Expected positive %, got ${pct}`);
  });
});

// ─── Coherence ───────────────────────────────────────────────────────────────

describe('HUD coherence', () => {
  it('displays rounded coherence score', () => {
    const { hud, els } = setup();
    hud.update({ hr: null, hrv: null, quality: 0, coherence: 75, pulse: 0 });
    const val = parseInt(els.coherenceValue.textContent, 10);
    assert.ok(val > 0, `Expected positive coherence, got ${val}`);
  });

  it('updates coherence bar fill width', () => {
    const { hud, els } = setup();
    hud.update({ hr: null, hrv: null, quality: 0, coherence: 80, pulse: 0 });
    const pct = parseInt(els.coherenceBar.style.width, 10);
    assert.ok(pct > 0, `Expected positive bar width, got ${pct}`);
  });

  it('ignores undefined coherence', () => {
    const { hud, els } = setup();
    hud.update({ hr: null, hrv: null, quality: 0, pulse: 0 });
    // coherenceValue should remain at initial '--' since no coherence provided
    assert.strictEqual(els.coherenceValue.textContent, '--');
  });
});

// ─── Pulse dot / beat ────────────────────────────────────────────────────────

describe('HUD pulse dot', () => {
  it('adds beat class on triggerBeat', () => {
    const { hud, els } = setup();
    hud.triggerBeat();
    assert.ok(els.pulseDot._classes.has('beat'));
  });

  it('removes beat class after timeout', async () => {
    const { hud, els } = setup();
    hud.triggerBeat();
    assert.ok(els.pulseDot._classes.has('beat'));
    // Wait for the timeout to fire (300ms + buffer)
    await new Promise(r => setTimeout(r, 400));
    assert.ok(!els.pulseDot._classes.has('beat'));
  });

  it('handles triggerBeat with null pulseDot', () => {
    const els = mockElements();
    els.pulseDot = null;
    const hud = new HUD(els);
    // Should not throw
    hud.triggerBeat();
  });
});

// ─── Sparkline / BPM history ─────────────────────────────────────────────────

describe('HUD BPM history', () => {
  it('records BPM values', () => {
    const { hud } = setup();
    hud.recordBPM(72);
    hud.recordBPM(74);
    assert.strictEqual(hud.bpmHistory.length, 2);
    assert.strictEqual(hud.bpmHistory[0], 72);
    assert.strictEqual(hud.bpmHistory[1], 74);
  });

  it('caps history at 30 entries', () => {
    const { hud } = setup();
    for (let i = 0; i < 40; i++) {
      hud.recordBPM(60 + i);
    }
    assert.strictEqual(hud.bpmHistory.length, 30);
    // Should have dropped earliest entries
    assert.strictEqual(hud.bpmHistory[0], 70);
  });

  it('rounds BPM values', () => {
    const { hud } = setup();
    hud.recordBPM(72.7);
    assert.strictEqual(hud.bpmHistory[0], 73);
  });

  it('calls drawSparkline when sparkline canvas is provided', () => {
    const els = mockElements();
    els.pulseDot.classList._el = els.pulseDot;
    let drawn = false;
    els.sparkline = {
      width: 200,
      height: 40,
      getContext() {
        return {
          clearRect() {},
          beginPath() { drawn = true; },
          moveTo() {},
          lineTo() {},
          stroke() {},
          strokeStyle: '',
          lineWidth: 0,
          lineJoin: '',
        };
      },
    };
    const hud = new HUD(els);
    hud.recordBPM(70);
    hud.recordBPM(72);
    assert.ok(drawn, 'drawSparkline should have been called');
  });
});

// ─── Reset ───────────────────────────────────────────────────────────────────

describe('HUD reset', () => {
  it('clears all smoothed values and history', () => {
    const { hud } = setup();
    hud.update({ hr: 72, hrv: 50, quality: 0.8, coherence: 80, pulse: 0 });
    hud.recordBPM(72);
    hud.reset();

    assert.strictEqual(hud._smoothHR, null);
    assert.strictEqual(hud._smoothHRV, null);
    assert.strictEqual(hud._smoothQuality, 0);
    assert.strictEqual(hud._smoothCoherence, 0);
    assert.deepStrictEqual(hud.bpmHistory, []);
  });
});

// ─── Null-safe element handling ──────────────────────────────────────────────

describe('HUD null elements', () => {
  it('handles null elements gracefully', () => {
    const hud = new HUD({
      hrValue: null,
      hrvValue: null,
      coherenceValue: null,
      coherenceBar: null,
      signalFill: null,
      qualityText: null,
      pulseDot: null,
      sparkline: null,
    });
    // Should not throw
    hud.update({ hr: 72, hrv: 50, quality: 0.8, coherence: 80, pulse: 0 });
    hud.recordBPM(72);
    hud.triggerBeat();
  });
});

// ─── Source code validation ──────────────────────────────────────────────────

describe('hud.js source structure', () => {
  const src = readFileSync(resolve(root, 'js/hud.js'), 'utf-8');

  it('imports drawSparkline from rppg.js', () => {
    assert.ok(src.includes("from './rppg.js'"));
    assert.ok(src.includes('drawSparkline'));
  });

  it('exports HUD class and createHUD factory', () => {
    assert.ok(src.includes('export class HUD'));
    assert.ok(src.includes('export function createHUD'));
  });

  it('defines smoothing constants', () => {
    assert.ok(src.includes('SMOOTH_FACTOR'));
    assert.ok(src.includes('BPM_HISTORY_MAX'));
    assert.ok(src.includes('QUALITY_THRESHOLD'));
  });

  it('has update methods for each metric', () => {
    assert.ok(src.includes('_updateHR'));
    assert.ok(src.includes('_updateHRV'));
    assert.ok(src.includes('_updateQuality'));
    assert.ok(src.includes('_updateCoherence'));
  });
});
