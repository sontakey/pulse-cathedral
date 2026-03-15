/**
 * Three.js scene setup and visual elements.
 * Pulse ring, particle field, waveform ribbon, cathedral columns, background grid.
 */

/* global THREE */

// --- Color constants matching the CSS palette ---
const NEON_TEAL = 0x00f5d4;
const MAGENTA = 0xff006e;
const SOFT_MAGENTA = 0xc77dff;
const ELECTRIC_BLUE = 0x4361ee;
const BG_DEEP = 0x0a0a0f;

const PARTICLE_COUNT = 2000;
const COLUMN_COUNT = 16;
const WAVEFORM_POINTS = 128;

/**
 * SceneManager — manages the Three.js 3D environment.
 */
export class SceneManager {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.animationId = null;
    this.onBeat = null;

    // Visual element groups
    this.pulseRing = null;
    this.particles = null;
    this.waveformRibbon = null;
    this.columns = [];
    this.grid = null;

    // Animation state
    this.clock = null;
    this.beatIntensity = 0;
    this.currentData = { hr: null, hrv: null, quality: 0, pulse: 0 };
    this._initialized = false;
  }

  /** Initialize Three.js renderer, scene, and camera. */
  init() {
    if (typeof THREE === 'undefined') {
      this._initialized = true;
      return;
    }

    this.clock = new THREE.Clock();

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(BG_DEEP, 1);

    // Scene
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(BG_DEEP, 0.015);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      200
    );
    this.camera.position.set(0, 3, 12);
    this.camera.lookAt(0, 0, 0);

    // Build visual elements
    this._buildPulseRing();
    this._buildParticles();
    this._buildWaveformRibbon();
    this._buildColumns();
    this._buildGrid();

    // Ambient light for subtle fill
    const ambient = new THREE.AmbientLight(0x111122, 0.3);
    this.scene.add(ambient);

    // Handle resize
    this._onResize = () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', this._onResize);

    // Beat callback
    this.onBeat = () => {
      this.beatIntensity = 1.0;
    };

    this._initialized = true;
  }

  /** Build the central pulse ring (torus). */
  _buildPulseRing() {
    const geometry = new THREE.TorusGeometry(2, 0.06, 16, 100);
    const material = new THREE.MeshBasicMaterial({
      color: NEON_TEAL,
      transparent: true,
      opacity: 0.8,
    });
    this.pulseRing = new THREE.Mesh(geometry, material);
    this.pulseRing.rotation.x = Math.PI / 2;
    this.scene.add(this.pulseRing);

    // Inner glow ring
    const glowGeo = new THREE.TorusGeometry(2, 0.2, 16, 100);
    const glowMat = new THREE.MeshBasicMaterial({
      color: NEON_TEAL,
      transparent: true,
      opacity: 0.15,
    });
    this.pulseRingGlow = new THREE.Mesh(glowGeo, glowMat);
    this.pulseRingGlow.rotation.x = Math.PI / 2;
    this.scene.add(this.pulseRingGlow);
  }

  /** Build the particle field (2000 points). */
  _buildParticles() {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const velocities = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3);
    const baseColor = new THREE.Color(NEON_TEAL);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      // Distribute particles in a sphere
      const r = 3 + Math.random() * 15;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i3 + 2] = r * Math.cos(phi);

      velocities[i3] = (Math.random() - 0.5) * 0.02;
      velocities[i3 + 1] = (Math.random() - 0.5) * 0.02;
      velocities[i3 + 2] = (Math.random() - 0.5) * 0.02;

      colors[i3] = baseColor.r;
      colors[i3 + 1] = baseColor.g;
      colors[i3 + 2] = baseColor.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.08,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.particles = new THREE.Points(geometry, material);
    this.particles._velocities = velocities;
    this.scene.add(this.particles);
  }

  /** Build the waveform ribbon (3D BVP trace). */
  _buildWaveformRibbon() {
    const points = [];
    for (let i = 0; i < WAVEFORM_POINTS; i++) {
      const x = (i / WAVEFORM_POINTS) * 10 - 5;
      points.push(new THREE.Vector3(x, 0, 0));
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: NEON_TEAL,
      transparent: true,
      opacity: 0.9,
      linewidth: 1,
    });

    this.waveformRibbon = new THREE.Line(geometry, material);
    this.waveformRibbon.position.set(0, 0, 3);
    this.scene.add(this.waveformRibbon);

    // Glow trail (wider, fainter)
    const glowMat = new THREE.LineBasicMaterial({
      color: NEON_TEAL,
      transparent: true,
      opacity: 0.2,
      linewidth: 1,
    });
    this.waveformGlow = new THREE.Line(geometry.clone(), glowMat);
    this.waveformGlow.position.set(0, 0, 3);
    this.scene.add(this.waveformGlow);

    // Store pulse history for the waveform
    this._pulseHistory = new Float32Array(WAVEFORM_POINTS);
  }

  /** Build the cathedral columns around the periphery. */
  _buildColumns() {
    const columnGeo = new THREE.BoxGeometry(0.15, 12, 0.15);

    for (let i = 0; i < COLUMN_COUNT; i++) {
      const angle = (i / COLUMN_COUNT) * Math.PI * 2;
      const radius = 10;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      const mat = new THREE.MeshBasicMaterial({
        color: ELECTRIC_BLUE,
        transparent: true,
        opacity: 0.3,
      });

      const column = new THREE.Mesh(columnGeo, mat);
      column.position.set(x, 0, z);
      column.lookAt(0, 0, 0);
      column.rotation.x = 0; // Keep columns vertical

      this.scene.add(column);
      this.columns.push(column);
    }
  }

  /** Build the perspective grid floor. */
  _buildGrid() {
    const gridSize = 40;
    const gridDivisions = 40;
    this.grid = new THREE.GridHelper(gridSize, gridDivisions, ELECTRIC_BLUE, ELECTRIC_BLUE);
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.1;
    this.grid.material.depthWrite = false;
    this.grid.position.y = -4;
    this.scene.add(this.grid);
  }

  /** Start the render loop. */
  start() {
    if (!this._initialized) this.init();
    const loop = () => {
      this.animationId = requestAnimationFrame(loop);
      this._render();
    };
    loop();
  }

  /** Stop the render loop. */
  stop() {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /**
   * Update scene parameters from biometric data.
   *
   * @param {{ hr: number|null, hrv: number|null, quality: number, pulse: number }} data
   */
  update(data) {
    this.currentData = data;
  }

  /** Trigger a heartbeat visual event. */
  triggerBeat() {
    if (this.onBeat) this.onBeat();
  }

  /** Internal render pass. */
  _render() {
    if (!this.renderer) return;

    const delta = this.clock.getDelta();
    const elapsed = this.clock.getElapsedTime();
    const data = this.currentData;
    const beat = this.beatIntensity;

    this._animatePulseRing(elapsed, beat, data);
    this._animateParticles(delta, beat, data);
    this._animateWaveform(elapsed, data);
    this._animateColumns(elapsed, beat);
    this._animateGrid(beat);

    // Decay beat intensity
    this.beatIntensity = Math.max(0, this.beatIntensity - delta * 3);

    // Gentle camera sway
    this.camera.position.x = Math.sin(elapsed * 0.1) * 0.5;
    this.camera.position.y = 3 + Math.sin(elapsed * 0.15) * 0.3;
    this.camera.lookAt(0, 0, 0);

    this.renderer.render(this.scene, this.camera);
  }

  /** Animate the pulse ring based on beat and HR. */
  _animatePulseRing(elapsed, beat, data) {
    if (!this.pulseRing) return;

    // Base scale with beat expansion
    const baseScale = 1.0 + beat * 0.4;
    const breathe = 1.0 + Math.sin(elapsed * 0.5) * 0.03;
    const scale = baseScale * breathe;
    this.pulseRing.scale.set(scale, scale, scale);
    this.pulseRingGlow.scale.set(scale * 1.05, scale * 1.05, scale * 1.05);

    // Opacity pulses with beat
    this.pulseRing.material.opacity = 0.6 + beat * 0.4;
    this.pulseRingGlow.material.opacity = 0.08 + beat * 0.2;

    // Color: teal → magenta based on HRV (low HRV = stressed = magenta)
    const teal = new THREE.Color(NEON_TEAL);
    const magenta = new THREE.Color(SOFT_MAGENTA);
    let hrvBlend = 0;
    if (data.hrv !== null) {
      // HRV of ~80ms+ is relaxed (teal), <20ms is stressed (magenta)
      hrvBlend = Math.max(0, Math.min(1, 1 - data.hrv / 80));
    }
    const ringColor = teal.clone().lerp(magenta, hrvBlend);
    this.pulseRing.material.color.copy(ringColor);
    this.pulseRingGlow.material.color.copy(ringColor);

    // Slow rotation
    this.pulseRing.rotation.z = elapsed * 0.1;
    this.pulseRingGlow.rotation.z = elapsed * 0.1;
  }

  /** Animate particles: shockwave on beat, speed from HR. */
  _animateParticles(delta, beat, data) {
    if (!this.particles) return;

    const positions = this.particles.geometry.attributes.position.array;
    const colors = this.particles.geometry.attributes.color.array;
    const velocities = this.particles._velocities;

    // Speed factor based on HR (72 BPM is baseline)
    const hrFactor = data.hr !== null ? data.hr / 72 : 1;
    const speed = 0.5 + hrFactor * 0.5;

    // Quality-based color: low quality = amber tint, high = teal
    const goodColor = new THREE.Color(NEON_TEAL);
    const poorColor = new THREE.Color(0xffb703);
    const particleColor = goodColor.clone().lerp(poorColor, 1 - data.quality);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      const x = positions[i3];
      const y = positions[i3 + 1];
      const z = positions[i3 + 2];

      // Move along velocity
      positions[i3] += velocities[i3] * speed;
      positions[i3 + 1] += velocities[i3 + 1] * speed;
      positions[i3 + 2] += velocities[i3 + 2] * speed;

      // Beat shockwave: push particles outward from center
      if (beat > 0.5) {
        const dist = Math.sqrt(x * x + y * y + z * z);
        if (dist > 0.1) {
          const pushStrength = beat * 0.15 / dist;
          positions[i3] += x * pushStrength;
          positions[i3 + 1] += y * pushStrength;
          positions[i3 + 2] += z * pushStrength;
        }
      }

      // Wrap particles that drift too far
      const dist = Math.sqrt(
        positions[i3] ** 2 + positions[i3 + 1] ** 2 + positions[i3 + 2] ** 2
      );
      if (dist > 20) {
        const r = 3 + Math.random() * 5;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        positions[i3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i3 + 2] = r * Math.cos(phi);
      }

      // Update colors
      colors[i3] = particleColor.r;
      colors[i3 + 1] = particleColor.g;
      colors[i3 + 2] = particleColor.b;
    }

    this.particles.geometry.attributes.position.needsUpdate = true;
    this.particles.geometry.attributes.color.needsUpdate = true;

    // Particle opacity pulses with beat
    this.particles.material.opacity = 0.5 + beat * 0.3;
  }

  /** Animate the waveform ribbon with pulse data. */
  _animateWaveform(elapsed, data) {
    if (!this.waveformRibbon) return;

    // Shift pulse history left, add new sample
    this._pulseHistory.copyWithin(0, 1);
    this._pulseHistory[WAVEFORM_POINTS - 1] = data.pulse || 0;

    const positions = this.waveformRibbon.geometry.attributes.position.array;
    const glowPositions = this.waveformGlow.geometry.attributes.position.array;

    for (let i = 0; i < WAVEFORM_POINTS; i++) {
      const i3 = i * 3;
      const x = (i / WAVEFORM_POINTS) * 10 - 5;
      const y = this._pulseHistory[i] * 2;
      // Slight z-wave for depth
      const z = Math.sin(elapsed * 0.3 + i * 0.05) * 0.1;

      positions[i3] = x;
      positions[i3 + 1] = y;
      positions[i3 + 2] = z;

      // Glow follows with slight offset
      glowPositions[i3] = x;
      glowPositions[i3 + 1] = y * 1.1;
      glowPositions[i3 + 2] = z;
    }

    this.waveformRibbon.geometry.attributes.position.needsUpdate = true;
    this.waveformGlow.geometry.attributes.position.needsUpdate = true;
  }

  /** Animate cathedral columns on beat. */
  _animateColumns(elapsed, beat) {
    for (let i = 0; i < this.columns.length; i++) {
      const column = this.columns[i];
      // Stagger the flash per column
      const stagger = i / COLUMN_COUNT;
      const flash = Math.max(0, beat - stagger * 0.3);

      // Base opacity with gentle breathing
      const breathe = 0.15 + Math.sin(elapsed * 0.3 + i * 0.5) * 0.05;
      column.material.opacity = breathe + flash * 0.6;

      // Flash color shifts toward teal on beat
      const base = new THREE.Color(ELECTRIC_BLUE);
      const bright = new THREE.Color(NEON_TEAL);
      column.material.color.copy(base.lerp(bright, flash));

      // Subtle vertical scale pulse
      const yScale = 1 + flash * 0.1;
      column.scale.set(1, yScale, 1);
    }
  }

  /** Animate grid with beat ripple. */
  _animateGrid(beat) {
    if (!this.grid) return;
    this.grid.material.opacity = 0.08 + beat * 0.12;
    // Subtle vertical shift on beat
    this.grid.position.y = -4 + beat * 0.1;
  }

  /** Clean up resources. */
  dispose() {
    this.stop();
    if (this._onResize) {
      window.removeEventListener('resize', this._onResize);
    }
    if (this.renderer) {
      this.renderer.dispose();
    }
    // Dispose geometries and materials
    if (this.scene) {
      this.scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });
    }
  }
}
