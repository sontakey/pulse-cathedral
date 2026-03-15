import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const shaderSrc = readFileSync(resolve(root, 'js/shaders.js'), 'utf-8');

// ─── Module exports ──────────────────────────────────────────────────────────

describe('shaders.js module exports', () => {
  it('exports all shader source strings', async () => {
    const mod = await import('../js/shaders.js');
    const sources = [
      'glowRingVertexSrc', 'glowRingFragmentSrc',
      'particleVertexSrc', 'particleFragmentSrc',
      'columnVertexSrc', 'columnFragmentSrc',
      'waveformVertexSrc', 'waveformFragmentSrc',
      'gridVertexSrc', 'gridFragmentSrc',
    ];
    for (const name of sources) {
      assert.ok(typeof mod[name] === 'string', `${name} should be a string`);
      assert.ok(mod[name].length > 20, `${name} should contain GLSL code`);
    }
  });

  it('exports all factory functions', async () => {
    const mod = await import('../js/shaders.js');
    const factories = [
      'createGlowRingMaterial',
      'createParticleMaterial',
      'createColumnMaterial',
      'createWaveformMaterial',
      'createGridMaterial',
    ];
    for (const name of factories) {
      assert.ok(typeof mod[name] === 'function', `${name} should be a function`);
    }
  });
});

// ─── GLSL source validation ─────────────────────────────────────────────────

describe('glow ring shader source', () => {
  it('vertex shader has main function and varyings', async () => {
    const { glowRingVertexSrc } = await import('../js/shaders.js');
    assert.ok(glowRingVertexSrc.includes('void main()'), 'Should have main()');
    assert.ok(glowRingVertexSrc.includes('gl_Position'), 'Should set gl_Position');
    assert.ok(glowRingVertexSrc.includes('vNormal'), 'Should pass normal varying');
  });

  it('fragment shader has fresnel glow and color blending', async () => {
    const { glowRingFragmentSrc } = await import('../js/shaders.js');
    assert.ok(glowRingFragmentSrc.includes('void main()'), 'Should have main()');
    assert.ok(glowRingFragmentSrc.includes('gl_FragColor'), 'Should set gl_FragColor');
    assert.ok(glowRingFragmentSrc.includes('fresnel'), 'Should compute fresnel');
    assert.ok(glowRingFragmentSrc.includes('uBlend'), 'Should use blend uniform');
    assert.ok(glowRingFragmentSrc.includes('mix('), 'Should mix colors');
    assert.ok(glowRingFragmentSrc.includes('uBeatIntensity'), 'Should use beat uniform');
  });
});

describe('particle shader source', () => {
  it('vertex shader has beat-driven size and twinkle', async () => {
    const { particleVertexSrc } = await import('../js/shaders.js');
    assert.ok(particleVertexSrc.includes('gl_PointSize'), 'Should set gl_PointSize');
    assert.ok(particleVertexSrc.includes('uBeatIntensity'), 'Should use beat uniform');
    assert.ok(particleVertexSrc.includes('uTime'), 'Should use time uniform');
    assert.ok(particleVertexSrc.includes('color'), 'Should use color attribute');
  });

  it('fragment shader has soft radial falloff', async () => {
    const { particleFragmentSrc } = await import('../js/shaders.js');
    assert.ok(particleFragmentSrc.includes('gl_PointCoord'), 'Should use PointCoord');
    assert.ok(particleFragmentSrc.includes('discard'), 'Should discard outside circle');
    assert.ok(particleFragmentSrc.includes('smoothstep'), 'Should use smoothstep falloff');
  });
});

describe('column shader source', () => {
  it('vertex shader passes UV and normals', async () => {
    const { columnVertexSrc } = await import('../js/shaders.js');
    assert.ok(columnVertexSrc.includes('vUv'), 'Should pass UV varying');
    assert.ok(columnVertexSrc.includes('vNormal'), 'Should pass normal varying');
  });

  it('fragment shader has vertical gradient and beat flash', async () => {
    const { columnFragmentSrc } = await import('../js/shaders.js');
    assert.ok(columnFragmentSrc.includes('vertGrad'), 'Should compute vertical gradient');
    assert.ok(columnFragmentSrc.includes('fresnel'), 'Should compute fresnel edge glow');
    assert.ok(columnFragmentSrc.includes('uFlashIntensity'), 'Should use flash uniform');
    assert.ok(columnFragmentSrc.includes('mix('), 'Should mix base and flash colors');
  });
});

describe('waveform shader source', () => {
  it('vertex shader has progress attribute and beat scale', async () => {
    const { waveformVertexSrc } = await import('../js/shaders.js');
    assert.ok(waveformVertexSrc.includes('aProgress'), 'Should use progress attribute');
    assert.ok(waveformVertexSrc.includes('uBeatIntensity'), 'Should use beat uniform');
    assert.ok(waveformVertexSrc.includes('beatScale'), 'Should compute beat scale');
  });

  it('fragment shader has progressive brightness', async () => {
    const { waveformFragmentSrc } = await import('../js/shaders.js');
    assert.ok(waveformFragmentSrc.includes('vBrightness'), 'Should use brightness varying');
    assert.ok(waveformFragmentSrc.includes('uColor'), 'Should use color uniform');
    assert.ok(waveformFragmentSrc.includes('uOpacity'), 'Should use opacity uniform');
  });
});

describe('grid shader source', () => {
  it('vertex shader passes world position', async () => {
    const { gridVertexSrc } = await import('../js/shaders.js');
    assert.ok(gridVertexSrc.includes('vWorldPosition'), 'Should pass world position');
  });

  it('fragment shader has radial fade and beat ripple', async () => {
    const { gridFragmentSrc } = await import('../js/shaders.js');
    assert.ok(gridFragmentSrc.includes('radialFade'), 'Should compute radial fade');
    assert.ok(gridFragmentSrc.includes('ripple'), 'Should compute beat ripple');
    assert.ok(gridFragmentSrc.includes('uBeatIntensity'), 'Should use beat uniform');
    assert.ok(gridFragmentSrc.includes('smoothstep'), 'Should use smoothstep for fade');
  });
});

// ─── Source code structure validation ────────────────────────────────────────

describe('shaders.js source structure', () => {
  it('contains all five shader categories', () => {
    assert.ok(shaderSrc.includes('Glow Ring Shader'), 'Should have glow ring section');
    assert.ok(shaderSrc.includes('Particle Shader'), 'Should have particle section');
    assert.ok(shaderSrc.includes('Column Shader'), 'Should have column section');
    assert.ok(shaderSrc.includes('Waveform Shader'), 'Should have waveform section');
    assert.ok(shaderSrc.includes('Grid Shader'), 'Should have grid section');
  });

  it('uses ShaderMaterial in factory functions', () => {
    assert.ok(shaderSrc.includes('ShaderMaterial'), 'Should create ShaderMaterial');
    assert.ok(shaderSrc.includes('vertexShader'), 'Should set vertexShader');
    assert.ok(shaderSrc.includes('fragmentShader'), 'Should set fragmentShader');
    assert.ok(shaderSrc.includes('uniforms'), 'Should define uniforms');
  });

  it('all shaders use transparency', () => {
    const transparentCount = (shaderSrc.match(/transparent:\s*true/g) || []).length;
    assert.ok(transparentCount >= 5, `Should have at least 5 transparent materials, got ${transparentCount}`);
  });

  it('uses additive blending for glow effects', () => {
    assert.ok(shaderSrc.includes('AdditiveBlending'), 'Should use additive blending');
  });

  it('disables depth write for glow layers', () => {
    assert.ok(shaderSrc.includes('depthWrite: false'), 'Should disable depth write');
  });

  it('defines common uniforms across shaders', () => {
    assert.ok(shaderSrc.includes('uTime'), 'Should have time uniform');
    assert.ok(shaderSrc.includes('uBeatIntensity'), 'Should have beat intensity uniform');
    assert.ok(shaderSrc.includes('uOpacity'), 'Should have opacity uniform');
  });
});

// ─── Integration with scene.js ───────────────────────────────────────────────

describe('scene.js shader integration', () => {
  const sceneSrc = readFileSync(resolve(root, 'js/scene.js'), 'utf-8');

  it('imports shader factory functions', () => {
    assert.ok(sceneSrc.includes("from './shaders.js'"), 'Should import from shaders.js');
    assert.ok(sceneSrc.includes('createGlowRingMaterial'), 'Should import glow ring factory');
    assert.ok(sceneSrc.includes('createParticleMaterial'), 'Should import particle factory');
    assert.ok(sceneSrc.includes('createColumnMaterial'), 'Should import column factory');
    assert.ok(sceneSrc.includes('createWaveformMaterial'), 'Should import waveform factory');
    assert.ok(sceneSrc.includes('createGridMaterial'), 'Should import grid factory');
  });

  it('drives shader uniforms in animation methods', () => {
    assert.ok(sceneSrc.includes('.uniforms'), 'Should access material uniforms');
    assert.ok(sceneSrc.includes('uBlend.value'), 'Should set blend uniform');
    assert.ok(sceneSrc.includes('uBeatIntensity.value'), 'Should set beat uniform');
    assert.ok(sceneSrc.includes('uTime.value'), 'Should set time uniform');
    assert.ok(sceneSrc.includes('uOpacity.value'), 'Should set opacity uniform');
    assert.ok(sceneSrc.includes('uFlashIntensity.value'), 'Should set flash uniform');
  });

  it('no longer uses MeshBasicMaterial for visual elements', () => {
    // MeshBasicMaterial should not appear in build methods (only in comments or unrelated code)
    const buildMethods = sceneSrc.substring(sceneSrc.indexOf('_buildPulseRing'));
    assert.ok(
      !buildMethods.includes('new THREE.MeshBasicMaterial'),
      'Build methods should not use MeshBasicMaterial'
    );
  });

  it('no longer uses PointsMaterial', () => {
    assert.ok(
      !sceneSrc.includes('PointsMaterial'),
      'Should not use PointsMaterial'
    );
  });

  it('no longer uses LineBasicMaterial', () => {
    assert.ok(
      !sceneSrc.includes('LineBasicMaterial'),
      'Should not use LineBasicMaterial'
    );
  });

  it('still uses correct color constants', () => {
    assert.ok(sceneSrc.includes('0x00f5d4'), 'Should use NEON_TEAL');
    assert.ok(sceneSrc.includes('0xc77dff'), 'Should use SOFT_MAGENTA');
    assert.ok(sceneSrc.includes('0x4361ee'), 'Should use ELECTRIC_BLUE');
  });

  it('passes aProgress attribute for waveform', () => {
    assert.ok(sceneSrc.includes('aProgress'), 'Should add aProgress attribute to waveform');
  });

  it('maintains HRV-driven color transitions', () => {
    assert.ok(sceneSrc.includes('hrvBlend'), 'Should compute HRV blend');
    assert.ok(sceneSrc.includes('uBlend.value = hrvBlend'), 'Should pass blend to shader');
  });
});
