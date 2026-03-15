/**
 * WebGL shaders for glow effects, pulse animations, and color transitions.
 * Each export provides GLSL source strings and a factory function that creates
 * a THREE.ShaderMaterial (requires the THREE global).
 */

/* global THREE */

// ─── Glow Ring Shader ────────────────────────────────────────────────────────
// Used by the pulse ring torus: radial glow that fades from center of tube
// outward, with beat-driven intensity and HRV-driven color blending.

export const glowRingVertexSrc = /* glsl */ `
varying vec3 vNormal;
varying vec3 vWorldPosition;

void main() {
  vNormal = normalize(normalMatrix * normal);
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

export const glowRingFragmentSrc = /* glsl */ `
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uBlend;
uniform float uBeatIntensity;
uniform float uTime;
uniform float uOpacity;

varying vec3 vNormal;
varying vec3 vWorldPosition;

void main() {
  // Fresnel-style rim glow: brighter at edges facing the camera
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);
  float fresnel = 1.0 - abs(dot(viewDir, vNormal));
  fresnel = pow(fresnel, 2.0);

  // Core glow (center brightness)
  float core = 0.3 + uBeatIntensity * 0.7;

  // Combine fresnel rim + core
  float glow = core + fresnel * (0.5 + uBeatIntensity * 0.5);

  // Pulsing shimmer
  float shimmer = sin(uTime * 3.0) * 0.05 + 1.0;
  glow *= shimmer;

  // Blend between two colors based on HRV
  vec3 color = mix(uColorA, uColorB, uBlend);

  gl_FragColor = vec4(color * glow, uOpacity * glow);
}
`;

/**
 * Create a ShaderMaterial for the glow ring.
 *
 * @param {{ colorA: number, colorB: number }} opts - Two hex colors to blend between.
 * @returns {THREE.ShaderMaterial}
 */
export function createGlowRingMaterial(opts = {}) {
  const colorA = new THREE.Color(opts.colorA ?? 0x00f5d4);
  const colorB = new THREE.Color(opts.colorB ?? 0xc77dff);
  return new THREE.ShaderMaterial({
    vertexShader: glowRingVertexSrc,
    fragmentShader: glowRingFragmentSrc,
    uniforms: {
      uColorA: { value: colorA },
      uColorB: { value: colorB },
      uBlend: { value: 0.0 },
      uBeatIntensity: { value: 0.0 },
      uTime: { value: 0.0 },
      uOpacity: { value: 0.8 },
    },
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

// ─── Particle Shader ─────────────────────────────────────────────────────────
// Point sprites with soft radial falloff, beat-driven size pulsing,
// and per-vertex color from the color attribute.

export const particleVertexSrc = /* glsl */ `
attribute vec3 color;

uniform float uSize;
uniform float uBeatIntensity;
uniform float uTime;

varying vec3 vColor;
varying float vDist;

void main() {
  vColor = color;
  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
  vDist = -mvPos.z;

  // Beat-driven size pulse
  float beat = 1.0 + uBeatIntensity * 0.6;
  // Slight per-particle variation using position hash
  float variation = sin(position.x * 12.9898 + position.y * 78.233) * 0.5 + 0.5;
  float twinkle = sin(uTime * 2.0 + variation * 6.283) * 0.15 + 1.0;

  gl_PointSize = uSize * beat * twinkle * (200.0 / vDist);
  gl_Position = projectionMatrix * mvPos;
}
`;

export const particleFragmentSrc = /* glsl */ `
uniform float uOpacity;

varying vec3 vColor;
varying float vDist;

void main() {
  // Soft circular point sprite
  vec2 center = gl_PointCoord - vec2(0.5);
  float dist = length(center);
  if (dist > 0.5) discard;

  // Smooth radial falloff for soft glow
  float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
  alpha *= alpha; // Sharper falloff

  // Distance-based fade
  float distFade = clamp(1.0 - vDist / 80.0, 0.1, 1.0);

  gl_FragColor = vec4(vColor, alpha * uOpacity * distFade);
}
`;

/**
 * Create a ShaderMaterial for the particle field.
 *
 * @param {{ size: number }} opts
 * @returns {THREE.ShaderMaterial}
 */
export function createParticleMaterial(opts = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: particleVertexSrc,
    fragmentShader: particleFragmentSrc,
    uniforms: {
      uSize: { value: opts.size ?? 4.0 },
      uBeatIntensity: { value: 0.0 },
      uTime: { value: 0.0 },
      uOpacity: { value: 0.7 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

// ─── Column Shader ───────────────────────────────────────────────────────────
// Cathedral columns: vertical gradient glow with beat flash and
// color transition from electric blue to neon teal.

export const columnVertexSrc = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;

void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

export const columnFragmentSrc = /* glsl */ `
uniform vec3 uBaseColor;
uniform vec3 uFlashColor;
uniform float uFlashIntensity;
uniform float uOpacity;
uniform float uTime;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;

void main() {
  // Vertical gradient: brightest at center, fades at top/bottom
  float vertGrad = 1.0 - abs(vUv.y - 0.5) * 2.0;
  vertGrad = pow(vertGrad, 0.8);

  // Edge glow (fresnel)
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);
  float fresnel = 1.0 - abs(dot(viewDir, vNormal));
  fresnel = pow(fresnel, 1.5);

  // Combine gradients
  float intensity = vertGrad * 0.6 + fresnel * 0.4;

  // Beat flash: blend base → flash color
  vec3 color = mix(uBaseColor, uFlashColor, uFlashIntensity);

  // Pulse animation on the column
  float pulse = sin(uTime * 0.5 + vUv.y * 6.283) * 0.05 + 1.0;
  intensity *= pulse;

  // Boost intensity on flash
  intensity += uFlashIntensity * 0.5;

  gl_FragColor = vec4(color * intensity, uOpacity * intensity);
}
`;

/**
 * Create a ShaderMaterial for cathedral columns.
 *
 * @param {{ baseColor: number, flashColor: number }} opts
 * @returns {THREE.ShaderMaterial}
 */
export function createColumnMaterial(opts = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: columnVertexSrc,
    fragmentShader: columnFragmentSrc,
    uniforms: {
      uBaseColor: { value: new THREE.Color(opts.baseColor ?? 0x4361ee) },
      uFlashColor: { value: new THREE.Color(opts.flashColor ?? 0x00f5d4) },
      uFlashIntensity: { value: 0.0 },
      uOpacity: { value: 0.3 },
      uTime: { value: 0.0 },
    },
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

// ─── Waveform Shader ─────────────────────────────────────────────────────────
// Line material with brightness variation along the waveform and beat glow.

export const waveformVertexSrc = /* glsl */ `
attribute float aProgress;

uniform float uBeatIntensity;
uniform float uTime;

varying float vProgress;
varying float vBrightness;

void main() {
  vProgress = aProgress;

  // Leading edge (right side, newest data) is brighter
  vBrightness = 0.3 + aProgress * 0.7;

  // Beat-driven vertical scale
  float beatScale = 1.0 + uBeatIntensity * 0.2;
  vec3 pos = position;
  pos.y *= beatScale;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

export const waveformFragmentSrc = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uBeatIntensity;
uniform float uTime;

varying float vProgress;
varying float vBrightness;

void main() {
  // Glow intensity: bright at leading edge, faded at trailing edge
  float glow = vBrightness + uBeatIntensity * 0.3;

  // Subtle pulsing
  float pulse = sin(uTime * 2.0 + vProgress * 3.14159) * 0.05 + 1.0;
  glow *= pulse;

  gl_FragColor = vec4(uColor * glow, uOpacity * glow);
}
`;

/**
 * Create a ShaderMaterial for the waveform ribbon.
 *
 * @param {{ color: number, opacity: number }} opts
 * @returns {THREE.ShaderMaterial}
 */
export function createWaveformMaterial(opts = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: waveformVertexSrc,
    fragmentShader: waveformFragmentSrc,
    uniforms: {
      uColor: { value: new THREE.Color(opts.color ?? 0x00f5d4) },
      uOpacity: { value: opts.opacity ?? 0.9 },
      uBeatIntensity: { value: 0.0 },
      uTime: { value: 0.0 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

// ─── Grid Shader ─────────────────────────────────────────────────────────────
// Floor grid with radial distance fade and beat-driven pulse ripple.

export const gridVertexSrc = /* glsl */ `
varying vec3 vWorldPosition;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

export const gridFragmentSrc = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uBeatIntensity;
uniform float uTime;

varying vec3 vWorldPosition;

void main() {
  // Radial distance from center for fade
  float dist = length(vWorldPosition.xz);
  float radialFade = 1.0 - smoothstep(5.0, 20.0, dist);

  // Beat ripple: expanding ring from center
  float ripple = sin(dist * 0.8 - uTime * 4.0) * 0.5 + 0.5;
  ripple *= uBeatIntensity;

  float intensity = radialFade * (1.0 + ripple * 0.5);

  gl_FragColor = vec4(uColor * intensity, uOpacity * intensity);
}
`;

/**
 * Create a ShaderMaterial for the background grid.
 *
 * @param {{ color: number }} opts
 * @returns {THREE.ShaderMaterial}
 */
export function createGridMaterial(opts = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: gridVertexSrc,
    fragmentShader: gridFragmentSrc,
    uniforms: {
      uColor: { value: new THREE.Color(opts.color ?? 0x4361ee) },
      uOpacity: { value: 0.1 },
      uBeatIntensity: { value: 0.0 },
      uTime: { value: 0.0 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}
