import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

describe('Project structure', () => {
  const expectedFiles = [
    'index.html',
    'css/style.css',
    'js/app.js',
    'js/rppg.js',
    'js/scene.js',
    'js/audio.js',
  ];

  for (const file of expectedFiles) {
    it(`${file} exists`, () => {
      assert.ok(existsSync(resolve(root, file)), `Missing file: ${file}`);
    });
  }
});

describe('index.html', () => {
  const html = readFileSync(resolve(root, 'index.html'), 'utf-8');

  it('has DOCTYPE', () => {
    assert.ok(html.startsWith('<!DOCTYPE html>'));
  });

  it('links style.css', () => {
    assert.ok(html.includes('css/style.css'));
  });

  it('loads app.js as ES module', () => {
    assert.match(html, /type="module".*src="js\/app\.js"/);
  });

  it('has a canvas#scene element', () => {
    assert.ok(html.includes('id="scene"'));
  });

  it('has a hidden video element for webcam', () => {
    assert.ok(html.includes('id="webcam"'));
  });

  it('has HUD elements', () => {
    assert.ok(html.includes('id="hud"'));
    assert.ok(html.includes('id="hr-value"'));
    assert.ok(html.includes('id="hrv-value"'));
    assert.ok(html.includes('id="signal-fill"'));
    assert.ok(html.includes('id="coherence-value"'));
    assert.ok(html.includes('id="sparkline"'));
  });

  it('has status overlay', () => {
    assert.ok(html.includes('id="status-overlay"'));
    assert.ok(html.includes('id="status-message"'));
  });

  it('includes MediaPipe Face Mesh CDN script', () => {
    assert.ok(html.includes('@mediapipe/face_mesh'));
  });
});

describe('style.css', () => {
  const css = readFileSync(resolve(root, 'css/style.css'), 'utf-8');

  it('defines color variables', () => {
    assert.ok(css.includes('--bg-deep'));
    assert.ok(css.includes('--neon-teal'));
    assert.ok(css.includes('--magenta'));
    assert.ok(css.includes('--electric-blue'));
  });

  it('styles the scene canvas to fill viewport', () => {
    assert.ok(css.includes('#scene'));
    assert.ok(css.includes('width: 100%'));
    assert.ok(css.includes('height: 100%'));
  });

  it('hides the webcam element', () => {
    assert.ok(css.includes('#webcam'));
    assert.ok(css.includes('opacity: 0'));
  });

  it('styles HUD as fixed overlay', () => {
    assert.ok(css.includes('#hud'));
    assert.ok(css.includes('position: fixed'));
  });

  it('uses the correct color palette from PRD', () => {
    assert.ok(css.includes('#0a0a0f'));   // deep black
    assert.ok(css.includes('#0d1117'));   // dark navy
    assert.ok(css.includes('#00f5d4'));   // neon teal
    assert.ok(css.includes('#ff006e'));   // magenta
    assert.ok(css.includes('#c77dff'));   // soft magenta
    assert.ok(css.includes('#4361ee'));   // electric blue
    assert.ok(css.includes('#ffb703'));   // amber
  });
});

describe('JS modules export correctly', () => {
  it('rppg.js exports RPPGProcessor', async () => {
    const mod = await import('../js/rppg.js');
    assert.ok(typeof mod.RPPGProcessor === 'function');
    assert.ok(typeof mod.posAlgorithm === 'function');
    assert.ok(typeof mod.detectPeaks === 'function');
    assert.ok(typeof mod.computeHR === 'function');
    assert.ok(typeof mod.computeHRV === 'function');
    assert.ok(typeof mod.signalQuality === 'function');
    assert.ok(typeof mod.extractROIBox === 'function');
    assert.ok(typeof mod.meanRGBFromROI === 'function');
    assert.ok(typeof mod.extractFaceROI === 'function');
    assert.ok(typeof mod.computeCoherence === 'function');
    assert.ok(typeof mod.drawSparkline === 'function');
    assert.ok(typeof mod.FaceDetector === 'function');
  });

  it('scene.js exports SceneManager', async () => {
    const mod = await import('../js/scene.js');
    assert.ok(typeof mod.SceneManager === 'function');
  });

  it('audio.js exports AudioManager', async () => {
    const mod = await import('../js/audio.js');
    assert.ok(typeof mod.AudioManager === 'function');
  });
});

describe('SceneManager', () => {
  it('can be constructed with a mock canvas', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    assert.ok(mgr);
  });

  it('init sets initialized flag', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    mgr.init();
    assert.ok(mgr._initialized);
  });

  it('stop cancels animation', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    mgr.animationId = 999;
    // In Node, cancelAnimationFrame doesn't exist, so just verify stop sets null
    globalThis.cancelAnimationFrame = () => {};
    mgr.stop();
    assert.strictEqual(mgr.animationId, null);
    delete globalThis.cancelAnimationFrame;
  });

  it('update stores data', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    const data = { hr: 72, hrv: 50, quality: 0.8, pulse: 0.1 };
    mgr.update(data);
    assert.deepStrictEqual(mgr.currentData, data);
  });
});

describe('AudioManager', () => {
  it('can be constructed', async () => {
    const { AudioManager } = await import('../js/audio.js');
    const mgr = new AudioManager();
    assert.ok(mgr);
    assert.strictEqual(mgr._initialized, false);
  });

  it('playBeat does nothing before init', async () => {
    const { AudioManager } = await import('../js/audio.js');
    const mgr = new AudioManager();
    // Should not throw
    mgr.playBeat(0.5);
  });

  it('setVolume does nothing before init', async () => {
    const { AudioManager } = await import('../js/audio.js');
    const mgr = new AudioManager();
    // Should not throw
    mgr.setVolume(0.8);
  });
});
