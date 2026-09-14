import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

describe('mobile.js module', () => {
  let mobile;

  beforeEach(async () => {
    mobile = await import('../js/mobile.js');
  });

  it('exports detectMobile function', () => {
    assert.ok(typeof mobile.detectMobile === 'function');
  });

  it('exports getPixelRatio function', () => {
    assert.ok(typeof mobile.getPixelRatio === 'function');
  });

  it('exports getParticleCount function', () => {
    assert.ok(typeof mobile.getParticleCount === 'function');
  });

  it('exports threshold constants', () => {
    assert.strictEqual(mobile.MOBILE_WIDTH_THRESHOLD, 768);
    assert.strictEqual(mobile.MOBILE_MAX_DPR, 2);
    assert.strictEqual(mobile.MOBILE_PARTICLE_COUNT, 1000);
    assert.strictEqual(mobile.DESKTOP_PARTICLE_COUNT, 2000);
  });

  it('detectMobile returns false in Node (no window)', () => {
    assert.strictEqual(mobile.detectMobile(), false);
  });

  it('getPixelRatio returns 1 in Node (no window)', () => {
    assert.strictEqual(mobile.getPixelRatio(true), 1);
    assert.strictEqual(mobile.getPixelRatio(false), 1);
  });

  it('getParticleCount returns 1000 for mobile', () => {
    assert.strictEqual(mobile.getParticleCount(true), 1000);
  });

  it('getParticleCount returns 2000 for desktop', () => {
    assert.strictEqual(mobile.getParticleCount(false), 2000);
  });
});

describe('Mobile detection with mocked window', () => {
  let originalWindow;

  beforeEach(() => {
    originalWindow = globalThis.window;
  });

  afterEach(() => {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  });

  it('detects narrow screen as mobile', async () => {
    globalThis.window = { innerWidth: 375, devicePixelRatio: 3 };
    const { detectMobile } = await import('../js/mobile.js');
    assert.strictEqual(detectMobile(), true);
  });

  it('detects wide screen as desktop', async () => {
    globalThis.window = { innerWidth: 1920, devicePixelRatio: 1 };
    const { detectMobile } = await import('../js/mobile.js');
    // Navigator.userAgent in Node doesn't match mobile patterns
    assert.strictEqual(detectMobile(), false);
  });

  it('getPixelRatio caps at 2 on mobile', async () => {
    globalThis.window = { innerWidth: 375, devicePixelRatio: 3 };
    const { getPixelRatio } = await import('../js/mobile.js');
    assert.strictEqual(getPixelRatio(true), 2);
  });

  it('getPixelRatio caps at 2 on desktop too', async () => {
    globalThis.window = { innerWidth: 1920, devicePixelRatio: 3 };
    const { getPixelRatio } = await import('../js/mobile.js');
    assert.strictEqual(getPixelRatio(false), 2);
  });

  it('getPixelRatio returns 1 when dpr is 1', async () => {
    globalThis.window = { innerWidth: 375, devicePixelRatio: 1 };
    const { getPixelRatio } = await import('../js/mobile.js');
    assert.strictEqual(getPixelRatio(true), 1);
  });
});


describe('Mobile CSS requirements', () => {
  const css = readFileSync(resolve(root, 'css/style.css'), 'utf-8');

  it('uses 100dvh for full viewport height', () => {
    assert.ok(css.includes('100dvh'));
  });

  it('uses clamp() for responsive text sizing', () => {
    assert.ok(css.includes('clamp('));
  });

  it('has touch-action: none to prevent scroll', () => {
    assert.ok(css.includes('touch-action: none'));
  });

  it('disables webkit tap highlight', () => {
    assert.ok(css.includes('-webkit-tap-highlight-color: transparent'));
  });

  it('has tap-overlay styles', () => {
    assert.ok(css.includes('#tap-overlay'));
    assert.ok(css.includes('#tap-message'));
  });

  it('has min 44px touch target for tap message', () => {
    assert.ok(css.includes('min-width: 44px'));
    assert.ok(css.includes('min-height: 44px'));
  });

  it('has mobile media query for screens <= 768px', () => {
    assert.ok(css.includes('@media (max-width: 768px)'));
  });

  it('has landscape orientation media query', () => {
    assert.ok(css.includes('orientation: landscape'));
  });

  it('uses safe-area-inset for bottom padding on mobile', () => {
    assert.ok(css.includes('safe-area-inset-bottom'));
  });

  it('styles #hr-value with clamp for responsive sizing', () => {
    assert.match(css, /hr-value[\s\S]*?clamp\(/);
  });
});

describe('Scene mobile integration', () => {
  it('scene.js imports from mobile.js', async () => {
    const sceneSource = readFileSync(resolve(root, 'js/scene.js'), 'utf-8');
    assert.ok(sceneSource.includes("from './mobile.js'"));
  });

  it('scene.js uses getParticleCount', () => {
    const sceneSource = readFileSync(resolve(root, 'js/scene.js'), 'utf-8');
    assert.ok(sceneSource.includes('getParticleCount'));
  });

  it('scene.js uses getPixelRatio', () => {
    const sceneSource = readFileSync(resolve(root, 'js/scene.js'), 'utf-8');
    assert.ok(sceneSource.includes('getPixelRatio'));
  });
});


describe('File structure includes mobile.js', () => {
  it('js/mobile.js exists', async () => {
    const { existsSync } = await import('node:fs');
    assert.ok(existsSync(resolve(root, 'js/mobile.js')));
  });
});
