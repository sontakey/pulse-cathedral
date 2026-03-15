import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  posAlgorithm,
  detectPeaks,
  computeHR,
  computeHRV,
  signalQuality,
  RPPGProcessor,
} from '../js/rppg.js';

describe('posAlgorithm', () => {
  it('returns 0 for empty or single-sample window', () => {
    assert.strictEqual(posAlgorithm([]), 0);
    assert.strictEqual(posAlgorithm([[128, 128, 128]]), 0);
  });

  it('returns 0 when a channel mean is zero', () => {
    const window = [[0, 100, 100], [0, 110, 105]];
    assert.strictEqual(posAlgorithm(window), 0);
  });

  it('returns a finite number for a valid window', () => {
    const window = [];
    for (let i = 0; i < 30; i++) {
      // Simulate subtle pulsatile variation in green channel
      const g = 128 + 2 * Math.sin((2 * Math.PI * i) / 15);
      window.push([128, g, 128]);
    }
    const result = posAlgorithm(window);
    assert.ok(Number.isFinite(result), `Expected finite, got ${result}`);
  });

  it('produces non-zero output for varying RGB input', () => {
    const window = [];
    for (let i = 0; i < 45; i++) {
      const phase = (2 * Math.PI * i) / 15;
      window.push([
        128 + Math.sin(phase),
        128 + 2 * Math.sin(phase + 0.3),
        128 + 0.5 * Math.sin(phase + 0.6),
      ]);
    }
    const result = posAlgorithm(window);
    assert.notStrictEqual(result, 0);
  });
});

describe('detectPeaks', () => {
  it('returns empty for flat signal', () => {
    assert.deepStrictEqual(detectPeaks([1, 1, 1, 1, 1]), []);
  });

  it('detects a single peak', () => {
    const signal = [0, 1, 3, 1, 0];
    assert.deepStrictEqual(detectPeaks(signal, 1), [2]);
  });

  it('respects minimum distance', () => {
    const signal = [0, 2, 0, 2, 0, 2, 0];
    // With minDistance=3, only first and last peaks should be found
    const peaks = detectPeaks(signal, 3);
    assert.strictEqual(peaks.length, 2);
    assert.strictEqual(peaks[0], 1);
    assert.strictEqual(peaks[1], 5);
  });

  it('finds multiple peaks when distance allows', () => {
    const signal = [0, 2, 0, 2, 0, 2, 0];
    const peaks = detectPeaks(signal, 1);
    assert.strictEqual(peaks.length, 3);
  });
});

describe('computeHR', () => {
  it('returns null with fewer than 2 peaks', () => {
    assert.strictEqual(computeHR([], 30), null);
    assert.strictEqual(computeHR([5], 30), null);
  });

  it('computes correct BPM for known interval', () => {
    // 30 samples apart at 30 fps = 1 second interval = 60 BPM
    const peaks = [0, 30, 60, 90];
    const hr = computeHR(peaks, 30);
    assert.strictEqual(hr, 60);
  });

  it('returns null for out-of-range BPM', () => {
    // 1 sample apart at 30 fps → 1800 BPM, way above max
    const hr = computeHR([0, 1], 30);
    assert.strictEqual(hr, null);
  });

  it('computes correct BPM for 120 BPM', () => {
    // 0.5 second intervals at 30 fps = 15 samples apart = 120 BPM
    const peaks = [0, 15, 30, 45];
    const hr = computeHR(peaks, 30);
    assert.strictEqual(hr, 120);
  });
});

describe('computeHRV', () => {
  it('returns null with fewer than 3 peaks', () => {
    assert.strictEqual(computeHRV([0, 30], 30), null);
  });

  it('returns 0 RMSSD for perfectly regular intervals', () => {
    // All intervals identical → successive differences are 0
    const peaks = [0, 30, 60, 90, 120];
    const hrv = computeHRV(peaks, 30);
    assert.strictEqual(hrv, 0);
  });

  it('returns positive RMSSD for irregular intervals', () => {
    // Alternating 28 and 32 sample intervals
    const peaks = [0, 28, 60, 88, 120];
    const hrv = computeHRV(peaks, 30);
    assert.ok(hrv > 0, `Expected positive HRV, got ${hrv}`);
  });
});

describe('signalQuality', () => {
  it('returns 0 for too-short signal', () => {
    assert.strictEqual(signalQuality([1, 2, 3]), 0);
  });

  it('returns 0 for flat signal', () => {
    const flat = new Array(30).fill(0.5);
    assert.strictEqual(signalQuality(flat), 0);
  });

  it('returns positive value for varying signal', () => {
    const signal = [];
    for (let i = 0; i < 60; i++) {
      signal.push(Math.sin((2 * Math.PI * i) / 20));
    }
    const q = signalQuality(signal);
    assert.ok(q > 0, `Expected positive quality, got ${q}`);
    assert.ok(q <= 1, `Expected quality <= 1, got ${q}`);
  });
});

describe('RPPGProcessor', () => {
  it('can be constructed', () => {
    const proc = new RPPGProcessor();
    assert.ok(proc);
    assert.strictEqual(proc.rgbBuffer.length, 0);
    assert.strictEqual(proc.pulseSignal.length, 0);
  });

  it('addSample returns expected shape', () => {
    const proc = new RPPGProcessor();
    const result = proc.addSample([128, 128, 128]);
    assert.ok('pulse' in result);
    assert.ok('hr' in result);
    assert.ok('hrv' in result);
    assert.ok('quality' in result);
  });

  it('accumulates samples in buffer', () => {
    const proc = new RPPGProcessor();
    for (let i = 0; i < 10; i++) {
      proc.addSample([128, 128, 128]);
    }
    assert.strictEqual(proc.rgbBuffer.length, 10);
  });

  it('caps buffer length', () => {
    const proc = new RPPGProcessor();
    for (let i = 0; i < 200; i++) {
      proc.addSample([128 + Math.sin(i * 0.1), 128, 128]);
    }
    assert.ok(proc.rgbBuffer.length <= proc.windowLength * 4);
  });

  it('reset clears state', () => {
    const proc = new RPPGProcessor();
    for (let i = 0; i < 50; i++) proc.addSample([128, 128, 128]);
    proc.reset();
    assert.strictEqual(proc.rgbBuffer.length, 0);
    assert.strictEqual(proc.pulseSignal.length, 0);
  });

  it('eventually produces HR for sinusoidal input', () => {
    const proc = new RPPGProcessor();
    // Simulate 10 seconds of 75 BPM (1.25 Hz) pulsatile signal
    let lastHr = null;
    for (let i = 0; i < 300; i++) {
      const phase = (2 * Math.PI * 1.25 * i) / 30;
      const r = 128 + 1 * Math.sin(phase);
      const g = 128 + 3 * Math.sin(phase + 0.2);
      const b = 128 + 0.5 * Math.sin(phase + 0.5);
      const result = proc.addSample([r, g, b]);
      if (result.hr !== null) lastHr = result.hr;
    }
    // We should get some HR reading after enough data
    assert.ok(lastHr !== null, 'Expected HR to be computed after 300 samples');
  });
});
