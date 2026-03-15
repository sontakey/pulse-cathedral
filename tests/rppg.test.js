import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
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
  drawSparkline,
  FaceDetector,
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

describe('extractROIBox', () => {
  it('returns zero box when no valid landmarks', () => {
    const box = extractROIBox([], [0, 1, 2], 640, 480);
    assert.strictEqual(box.w, 0);
    assert.strictEqual(box.h, 0);
  });

  it('computes correct bounding box from landmarks', () => {
    // Create sparse landmarks array with specific positions
    const landmarks = [];
    landmarks[0] = { x: 0.25, y: 0.25 };
    landmarks[1] = { x: 0.75, y: 0.25 };
    landmarks[2] = { x: 0.5, y: 0.75 };
    const box = extractROIBox(landmarks, [0, 1, 2], 100, 100);
    assert.strictEqual(box.x, 25);
    assert.strictEqual(box.y, 25);
    assert.strictEqual(box.w, 50);
    assert.strictEqual(box.h, 50);
  });

  it('clamps to image bounds', () => {
    const landmarks = [];
    landmarks[0] = { x: 0.0, y: 0.0 };
    landmarks[1] = { x: 1.0, y: 1.0 };
    const box = extractROIBox(landmarks, [0, 1], 640, 480);
    assert.ok(box.x >= 0);
    assert.ok(box.y >= 0);
    assert.ok(box.x + box.w <= 640);
    assert.ok(box.y + box.h <= 480);
  });

  it('handles single landmark', () => {
    const landmarks = [];
    landmarks[5] = { x: 0.5, y: 0.5 };
    const box = extractROIBox(landmarks, [5], 200, 200);
    assert.ok(box.x >= 0);
    assert.ok(box.y >= 0);
  });

  it('skips missing landmark indices', () => {
    const landmarks = [];
    landmarks[0] = { x: 0.3, y: 0.3 };
    // Index 1 is missing
    landmarks[2] = { x: 0.7, y: 0.7 };
    const box = extractROIBox(landmarks, [0, 1, 2], 100, 100);
    assert.strictEqual(box.x, 30);
    assert.strictEqual(box.y, 30);
  });
});

describe('meanRGBFromROI', () => {
  it('returns [0,0,0] for empty box', () => {
    const pixels = new Uint8ClampedArray(4 * 100);
    const result = meanRGBFromROI(pixels, 10, { x: 0, y: 0, w: 0, h: 0 });
    assert.deepStrictEqual(result, [0, 0, 0]);
  });

  it('computes correct mean for uniform pixels', () => {
    // 4x4 image, all pixels are (100, 150, 200, 255)
    const w = 4, h = 4;
    const pixels = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      pixels[i * 4] = 100;
      pixels[i * 4 + 1] = 150;
      pixels[i * 4 + 2] = 200;
      pixels[i * 4 + 3] = 255;
    }
    const result = meanRGBFromROI(pixels, w, { x: 0, y: 0, w, h });
    assert.strictEqual(result[0], 100);
    assert.strictEqual(result[1], 150);
    assert.strictEqual(result[2], 200);
  });

  it('computes correct mean for a sub-region', () => {
    // 4x4 image: top-left 2x2 = (10,20,30), rest = (40,50,60)
    const w = 4, h = 4;
    const pixels = new Uint8ClampedArray(w * h * 4);
    for (let row = 0; row < h; row++) {
      for (let col = 0; col < w; col++) {
        const i = (row * w + col) * 4;
        if (row < 2 && col < 2) {
          pixels[i] = 10; pixels[i + 1] = 20; pixels[i + 2] = 30;
        } else {
          pixels[i] = 40; pixels[i + 1] = 50; pixels[i + 2] = 60;
        }
        pixels[i + 3] = 255;
      }
    }
    // Sample just the top-left 2x2
    const result = meanRGBFromROI(pixels, w, { x: 0, y: 0, w: 2, h: 2 });
    assert.strictEqual(result[0], 10);
    assert.strictEqual(result[1], 20);
    assert.strictEqual(result[2], 30);
  });
});

describe('extractFaceROI', () => {
  it('returns [0,0,0] when landmarks have no valid ROI regions', () => {
    const result = extractFaceROI([], new Uint8ClampedArray(0), 0, 0);
    assert.deepStrictEqual(result, [0, 0, 0]);
  });

  it('extracts combined mean from multiple ROI regions', () => {
    // Create a large enough landmark array with positions for forehead, left cheek, right cheek
    const landmarks = new Array(500);
    // Place all landmarks at center of a 100x100 image
    const foreheadIndices = [10, 67, 69, 104, 108, 109, 151, 299, 297, 338, 337, 336];
    const leftCheekIndices = [36, 50, 116, 117, 118, 119, 123, 132, 147, 187, 205, 206];
    const rightCheekIndices = [266, 280, 345, 346, 347, 348, 352, 361, 376, 411, 425, 426];

    for (const idx of [...foreheadIndices, ...leftCheekIndices, ...rightCheekIndices]) {
      landmarks[idx] = { x: 0.5, y: 0.5 };
    }
    // Spread them slightly to create non-zero boxes
    landmarks[10] = { x: 0.4, y: 0.3 };
    landmarks[151] = { x: 0.6, y: 0.4 };
    landmarks[36] = { x: 0.2, y: 0.5 };
    landmarks[206] = { x: 0.4, y: 0.7 };
    landmarks[266] = { x: 0.6, y: 0.5 };
    landmarks[426] = { x: 0.8, y: 0.7 };

    // Create uniform 100x100 image with RGB = (128, 128, 128)
    const w = 100, h = 100;
    const pixels = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      pixels[i * 4] = 128;
      pixels[i * 4 + 1] = 128;
      pixels[i * 4 + 2] = 128;
      pixels[i * 4 + 3] = 255;
    }

    const result = extractFaceROI(landmarks, pixels, w, h);
    assert.ok(result[0] > 0, 'Expected non-zero R');
    assert.ok(result[1] > 0, 'Expected non-zero G');
    assert.ok(result[2] > 0, 'Expected non-zero B');
    // All same color → should be close to 128
    assert.ok(Math.abs(result[0] - 128) < 1, `R should be ~128, got ${result[0]}`);
  });
});

describe('computeCoherence', () => {
  it('returns 0 for fewer than 4 peaks', () => {
    assert.strictEqual(computeCoherence([0, 30, 60], 30), 0);
  });

  it('returns 100 for perfectly regular intervals', () => {
    const peaks = [0, 30, 60, 90, 120, 150];
    const coherence = computeCoherence(peaks, 30);
    assert.strictEqual(coherence, 100);
  });

  it('returns lower value for irregular intervals', () => {
    // Irregular intervals: 20, 40, 20, 40 samples
    const peaks = [0, 20, 60, 80, 120];
    const coherence = computeCoherence(peaks, 30);
    assert.ok(coherence < 100, `Expected <100, got ${coherence}`);
    assert.ok(coherence >= 0, `Expected >=0, got ${coherence}`);
  });

  it('returns 0 for very irregular intervals', () => {
    // Extremely irregular: intervals of 5, 90, 5, 90
    const peaks = [0, 5, 95, 100, 190];
    const coherence = computeCoherence(peaks, 30);
    assert.strictEqual(coherence, 0);
  });

  it('returns value between 0 and 100', () => {
    // Mildly irregular
    const peaks = [0, 28, 62, 90, 118, 150];
    const coherence = computeCoherence(peaks, 30);
    assert.ok(coherence >= 0 && coherence <= 100, `Out of range: ${coherence}`);
  });
});

describe('drawSparkline', () => {
  // Mock a minimal canvas for Node.js testing
  function mockCanvas() {
    const ops = [];
    return {
      width: 200,
      height: 40,
      getContext() {
        return {
          clearRect: (...args) => ops.push(['clearRect', ...args]),
          beginPath: () => ops.push(['beginPath']),
          moveTo: (x, y) => ops.push(['moveTo', x, y]),
          lineTo: (x, y) => ops.push(['lineTo', x, y]),
          stroke: () => ops.push(['stroke']),
          strokeStyle: '',
          lineWidth: 0,
          lineJoin: '',
        };
      },
      _ops: ops,
    };
  }

  it('does nothing with fewer than 2 data points', () => {
    const canvas = mockCanvas();
    drawSparkline(canvas, [72]);
    // Should only have clearRect, no drawing ops
    assert.ok(canvas._ops.some(op => op[0] === 'clearRect'));
    assert.ok(!canvas._ops.some(op => op[0] === 'stroke'));
  });

  it('draws a line for valid BPM history', () => {
    const canvas = mockCanvas();
    drawSparkline(canvas, [70, 72, 74, 73, 71]);
    assert.ok(canvas._ops.some(op => op[0] === 'beginPath'));
    assert.ok(canvas._ops.some(op => op[0] === 'moveTo'));
    assert.ok(canvas._ops.some(op => op[0] === 'lineTo'));
    assert.ok(canvas._ops.some(op => op[0] === 'stroke'));
  });

  it('draws correct number of line segments', () => {
    const canvas = mockCanvas();
    const data = [60, 65, 70, 75, 80];
    drawSparkline(canvas, data);
    const lineOps = canvas._ops.filter(op => op[0] === 'lineTo');
    assert.strictEqual(lineOps.length, data.length - 1); // n-1 lineTo calls
  });
});

describe('FaceDetector', () => {
  it('can be constructed', () => {
    const det = new FaceDetector();
    assert.ok(det);
    assert.strictEqual(det.lastLandmarks, null);
    assert.strictEqual(det._ready, false);
    assert.strictEqual(det.hasFace, false);
  });

  it('sampleRGB returns null when no face detected', () => {
    const det = new FaceDetector();
    // Mock canvas and video
    const canvas = { getContext: () => ({}) };
    const video = { videoWidth: 640, videoHeight: 480 };
    const result = det.sampleRGB(canvas, video);
    assert.strictEqual(result, null);
  });

  it('hasFace returns true when landmarks are set', () => {
    const det = new FaceDetector();
    det.lastLandmarks = [{ x: 0.5, y: 0.5 }];
    assert.strictEqual(det.hasFace, true);
  });

  it('init throws when FaceMesh is not available', async () => {
    const det = new FaceDetector();
    await assert.rejects(() => det.init(), {
      message: /MediaPipe FaceMesh not loaded/,
    });
  });
});
