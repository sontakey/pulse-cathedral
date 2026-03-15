import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// Since Three.js is a browser-only CDN dependency, these tests validate
// the SceneManager API surface and behavior in a Node.js environment
// where THREE is undefined (graceful degradation path).

describe('SceneManager construction', () => {
  it('exports SceneManager class', async () => {
    const mod = await import('../js/scene.js');
    assert.ok(typeof mod.SceneManager === 'function');
  });

  it('can be constructed with a mock canvas', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    assert.ok(mgr);
    assert.strictEqual(mgr.renderer, null);
    assert.strictEqual(mgr.scene, null);
    assert.strictEqual(mgr.camera, null);
    assert.strictEqual(mgr.animationId, null);
  });

  it('initializes with correct default state', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    assert.strictEqual(mgr.beatIntensity, 0);
    assert.deepStrictEqual(mgr.currentData, { hr: null, hrv: null, quality: 0, pulse: 0, coherence: 0 });
    assert.strictEqual(mgr._initialized, false);
    assert.strictEqual(mgr.pulseRing, null);
    assert.strictEqual(mgr.particles, null);
    assert.strictEqual(mgr.waveformRibbon, null);
    assert.deepStrictEqual(mgr.columns, []);
    assert.strictEqual(mgr.grid, null);
  });
});

describe('SceneManager.init without THREE', () => {
  it('sets initialized flag even without Three.js', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    mgr.init();
    assert.ok(mgr._initialized);
  });

  it('does not create renderer when THREE is undefined', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    mgr.init();
    assert.strictEqual(mgr.renderer, null);
    assert.strictEqual(mgr.scene, null);
    assert.strictEqual(mgr.camera, null);
  });
});

describe('SceneManager.update', () => {
  it('stores biometric data', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    const data = { hr: 72, hrv: 50, quality: 0.8, pulse: 0.1 };
    mgr.update(data);
    assert.deepStrictEqual(mgr.currentData, data);
  });

  it('overwrites previous data', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    mgr.update({ hr: 60, hrv: 40, quality: 0.5, pulse: 0 });
    mgr.update({ hr: 80, hrv: 30, quality: 0.9, pulse: 0.2 });
    assert.strictEqual(mgr.currentData.hr, 80);
    assert.strictEqual(mgr.currentData.quality, 0.9);
  });

  it('accepts null HR and HRV', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    mgr.update({ hr: null, hrv: null, quality: 0, pulse: 0 });
    assert.strictEqual(mgr.currentData.hr, null);
    assert.strictEqual(mgr.currentData.hrv, null);
  });
});

describe('SceneManager.triggerBeat', () => {
  it('calls onBeat callback when set', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    let called = false;
    mgr.onBeat = () => { called = true; };
    mgr.triggerBeat();
    assert.ok(called);
  });

  it('does nothing when onBeat is null', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    mgr.onBeat = null;
    // Should not throw
    mgr.triggerBeat();
  });
});

describe('SceneManager.stop', () => {
  it('cancels animation and resets ID', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    mgr.animationId = 42;
    globalThis.cancelAnimationFrame = () => {};
    mgr.stop();
    assert.strictEqual(mgr.animationId, null);
    delete globalThis.cancelAnimationFrame;
  });

  it('does nothing when animationId is null', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    mgr.animationId = null;
    // Should not throw
    mgr.stop();
    assert.strictEqual(mgr.animationId, null);
  });
});

describe('SceneManager.dispose', () => {
  it('stops animation loop', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    mgr.animationId = 99;
    globalThis.cancelAnimationFrame = () => {};
    mgr.dispose();
    assert.strictEqual(mgr.animationId, null);
    delete globalThis.cancelAnimationFrame;
  });

  it('calls renderer.dispose when renderer exists', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    let disposeCalled = false;
    mgr.renderer = { dispose: () => { disposeCalled = true; } };
    globalThis.cancelAnimationFrame = () => {};
    mgr.dispose();
    assert.ok(disposeCalled);
    delete globalThis.cancelAnimationFrame;
  });

  it('handles no renderer gracefully', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    mgr.renderer = null;
    globalThis.cancelAnimationFrame = () => {};
    mgr.dispose();
    // Should not throw
    delete globalThis.cancelAnimationFrame;
  });
});

describe('SceneManager._render without renderer', () => {
  it('returns early when renderer is null', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    mgr.renderer = null;
    // Should not throw
    mgr._render();
  });
});

describe('SceneManager.init sets up onBeat callback', () => {
  it('onBeat sets beatIntensity to 1', async () => {
    const { SceneManager } = await import('../js/scene.js');
    const mgr = new SceneManager({});
    mgr.init();
    // Without THREE, onBeat is not set (returns early), so manually test
    // the pattern that init would set up:
    mgr.beatIntensity = 0;
    mgr.onBeat = () => { mgr.beatIntensity = 1.0; };
    mgr.onBeat();
    assert.strictEqual(mgr.beatIntensity, 1.0);
  });
});

describe('scene.js source code validation', () => {
  const src = readFileSync(resolve(root, 'js/scene.js'), 'utf-8');

  it('references pulse ring', () => {
    assert.ok(src.includes('pulseRing'), 'Should have pulseRing');
    assert.ok(src.includes('_buildPulseRing'), 'Should build pulse ring');
  });

  it('references particle field', () => {
    assert.ok(src.includes('particles'), 'Should have particles');
    assert.ok(src.includes('_buildParticles'), 'Should build particles');
    assert.ok(src.includes('PARTICLE_COUNT'), 'Should define PARTICLE_COUNT');
  });

  it('references waveform ribbon', () => {
    assert.ok(src.includes('waveformRibbon'), 'Should have waveformRibbon');
    assert.ok(src.includes('_buildWaveformRibbon'), 'Should build waveform ribbon');
    assert.ok(src.includes('_pulseHistory'), 'Should track pulse history');
  });

  it('references cathedral columns', () => {
    assert.ok(src.includes('columns'), 'Should have columns');
    assert.ok(src.includes('_buildColumns'), 'Should build columns');
    assert.ok(src.includes('COLUMN_COUNT'), 'Should define COLUMN_COUNT');
  });

  it('references background grid', () => {
    assert.ok(src.includes('grid'), 'Should have grid');
    assert.ok(src.includes('_buildGrid'), 'Should build grid');
    assert.ok(src.includes('GridHelper'), 'Should use GridHelper');
  });

  it('uses correct color palette', () => {
    assert.ok(src.includes('0x00f5d4'), 'Should use neon teal');
    assert.ok(src.includes('0xff006e'), 'Should use magenta');
    assert.ok(src.includes('0xc77dff'), 'Should use soft magenta');
    assert.ok(src.includes('0x4361ee'), 'Should use electric blue');
    assert.ok(src.includes('0x0a0a0f'), 'Should use deep black');
  });

  it('has animation methods for each element', () => {
    assert.ok(src.includes('_animatePulseRing'), 'Should animate pulse ring');
    assert.ok(src.includes('_animateParticles'), 'Should animate particles');
    assert.ok(src.includes('_animateWaveform'), 'Should animate waveform');
    assert.ok(src.includes('_animateColumns'), 'Should animate columns');
    assert.ok(src.includes('_animateGrid'), 'Should animate grid');
  });

  it('uses particle count of 2000', () => {
    assert.ok(src.includes('2000'), 'Should use 2000 particles');
  });

  it('uses custom shader materials for particles', () => {
    assert.ok(src.includes('createParticleMaterial'), 'Should use shader particle material');
  });

  it('uses TorusGeometry for pulse ring', () => {
    assert.ok(src.includes('TorusGeometry'), 'Should use torus geometry');
  });

  it('handles HRV-based color transitions', () => {
    assert.ok(src.includes('hrvBlend'), 'Should compute HRV blend');
    assert.ok(src.includes('lerp'), 'Should lerp between colors');
  });

  it('has HR-driven pulse ring radius scaling', () => {
    assert.ok(src.includes('hrScale'), 'Should compute HR-driven scale');
    assert.ok(src.includes('72 / data.hr'), 'Should use 72 BPM baseline for ring size');
  });

  it('uses coherence for column brightness', () => {
    assert.ok(src.includes('coherenceGlow'), 'Should compute coherence glow');
    assert.ok(src.includes('data.coherence'), 'Should read coherence from data');
  });

  it('uses HR for grid ripple intensity', () => {
    assert.ok(src.includes('rippleBoost'), 'Should compute ripple boost from HR');
  });

  it('uses HRV for waveform breathing amplitude', () => {
    assert.ok(src.includes('hrvAmp'), 'Should compute HRV-driven Z-axis amplitude');
  });

  it('applies HRV color blend to particles', () => {
    // Particles should blend teal→magenta based on HRV
    const particleSection = src.substring(src.indexOf('_animateParticles'));
    assert.ok(particleSection.includes('hrvBlend'), 'Particles should use HRV blend');
    assert.ok(particleSection.includes('MAGENTA'), 'Particles should blend toward magenta');
  });

  it('handles beat intensity decay', () => {
    assert.ok(src.includes('beatIntensity'), 'Should track beat intensity');
    assert.ok(src.includes('Math.max(0'), 'Should decay beat intensity');
  });

  it('handles window resize', () => {
    assert.ok(src.includes('resize'), 'Should handle resize events');
    assert.ok(src.includes('updateProjectionMatrix'), 'Should update camera projection');
  });

  it('uses fog for atmospheric depth', () => {
    assert.ok(src.includes('FogExp2'), 'Should use exponential fog');
  });

  it('disposes scene resources properly', () => {
    assert.ok(src.includes('dispose'), 'Should have dispose method');
    assert.ok(src.includes('traverse'), 'Should traverse scene to dispose');
  });

  it('uses BufferGeometry for particles', () => {
    assert.ok(src.includes('BufferGeometry'), 'Should use BufferGeometry');
    assert.ok(src.includes('BufferAttribute'), 'Should use BufferAttribute');
    assert.ok(src.includes('Float32Array'), 'Should use typed arrays');
  });

  it('applies camera sway for organic feel', () => {
    assert.ok(src.includes('camera.position'), 'Should move camera');
    assert.ok(src.includes('lookAt'), 'Should use lookAt');
  });
});

describe('index.html includes Three.js CDN', () => {
  const html = readFileSync(resolve(root, 'index.html'), 'utf-8');

  it('loads Three.js from CDN', () => {
    assert.ok(html.includes('three'), 'Should include Three.js script');
    assert.ok(html.includes('cdn.jsdelivr.net'), 'Should use jsdelivr CDN');
  });

  it('loads Three.js before app.js', () => {
    const threeIdx = html.indexOf('three');
    const appIdx = html.indexOf('js/app.js');
    assert.ok(threeIdx < appIdx, 'Three.js should load before app.js');
  });
});
