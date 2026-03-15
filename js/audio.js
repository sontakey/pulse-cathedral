/**
 * Web Audio API module.
 * Ambient drone + heartbeat thud sound.
 */

/** Base frequency for the ambient drone at 72 BPM resting HR. */
const DRONE_BASE_FREQ = 55; // A1
/** Detune offset for the second drone layer (perfect fifth above). */
const DRONE_DETUNE = 700; // ~perfect fifth in cents
/** Default master gain. */
const DEFAULT_VOLUME = 0.3;
/** Drone fade-in/out time in seconds. */
const DRONE_FADE_TIME = 2;
/** Maximum drone gain. */
const DRONE_MAX_GAIN = 0.12;
/** Frequency smoothing time for drone pitch shifts in seconds. */
const DRONE_SMOOTH_TIME = 0.5;

/**
 * AudioManager — manages the Web Audio context, ambient drone, and heartbeat thud.
 */
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this._initialized = false;

    // Drone state
    this._droneOsc1 = null;
    this._droneOsc2 = null;
    this._droneGain = null;
    this._droneRunning = false;
    this._currentHR = 72;
  }

  /**
   * Initialize the Web Audio context.
   * Must be called from a user gesture handler.
   */
  init() {
    if (this._initialized) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = DEFAULT_VOLUME;
    this.masterGain.connect(this.ctx.destination);
    this._initialized = true;
  }

  /**
   * Start the ambient drone.
   * Two detuned oscillators create a rich, evolving pad.
   */
  startDrone() {
    if (!this._initialized || this._droneRunning) return;
    const now = this.ctx.currentTime;

    this._droneGain = this.ctx.createGain();
    this._droneGain.gain.setValueAtTime(0.001, now);
    this._droneGain.gain.exponentialRampToValueAtTime(DRONE_MAX_GAIN, now + DRONE_FADE_TIME);
    this._droneGain.connect(this.masterGain);

    // Layer 1: base sine tone
    this._droneOsc1 = this.ctx.createOscillator();
    this._droneOsc1.type = 'sine';
    this._droneOsc1.frequency.setValueAtTime(DRONE_BASE_FREQ, now);
    this._droneOsc1.connect(this._droneGain);
    this._droneOsc1.start(now);

    // Layer 2: detuned triangle for warmth
    this._droneOsc2 = this.ctx.createOscillator();
    this._droneOsc2.type = 'triangle';
    this._droneOsc2.frequency.setValueAtTime(DRONE_BASE_FREQ, now);
    this._droneOsc2.detune.setValueAtTime(DRONE_DETUNE, now);
    this._droneOsc2.connect(this._droneGain);
    this._droneOsc2.start(now);

    this._droneRunning = true;
  }

  /**
   * Stop the ambient drone with a fade-out.
   */
  stopDrone() {
    if (!this._droneRunning) return;
    const now = this.ctx.currentTime;
    const endTime = now + DRONE_FADE_TIME;

    this._droneGain.gain.setValueAtTime(this._droneGain.gain.value, now);
    this._droneGain.gain.exponentialRampToValueAtTime(0.001, endTime);

    this._droneOsc1.stop(endTime);
    this._droneOsc2.stop(endTime);

    this._droneOsc1 = null;
    this._droneOsc2 = null;
    this._droneGain = null;
    this._droneRunning = false;
  }

  /**
   * Update the drone pitch based on current heart rate.
   * Higher HR shifts the drone up; lower HR shifts it down.
   *
   * @param {number} hr — current heart rate in BPM
   */
  updateDrone(hr) {
    this._currentHR = hr;
    if (!this._droneRunning) return;
    // Scale frequency relative to resting HR of 72
    const ratio = hr / 72;
    const freq = DRONE_BASE_FREQ * ratio;
    const now = this.ctx.currentTime;
    this._droneOsc1.frequency.setTargetAtTime(freq, now, DRONE_SMOOTH_TIME);
    this._droneOsc2.frequency.setTargetAtTime(freq, now, DRONE_SMOOTH_TIME);
  }

  /**
   * Set drone volume based on signal quality.
   * Poor quality fades the drone; good quality brings it up.
   *
   * @param {number} quality — 0 to 1
   */
  updateDroneIntensity(quality) {
    if (!this._droneRunning) return;
    const target = DRONE_MAX_GAIN * Math.max(0.1, quality);
    const now = this.ctx.currentTime;
    this._droneGain.gain.setTargetAtTime(target, now, DRONE_SMOOTH_TIME);
  }

  /**
   * Play a heartbeat thud sound.
   * Dual-layer: sub-bass thud + click transient for visceral feel.
   *
   * @param {number} intensity — 0 to 1
   */
  playBeat(intensity = 0.5) {
    if (!this._initialized) return;
    const now = this.ctx.currentTime;

    // Layer 1: sub-bass thud — sine sweep from 55 Hz down to 30 Hz
    const sub = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(55, now);
    sub.frequency.exponentialRampToValueAtTime(30, now + 0.15);
    subGain.gain.setValueAtTime(intensity * 0.6, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    sub.connect(subGain);
    subGain.connect(this.masterGain);
    sub.start(now);
    sub.stop(now + 0.25);

    // Layer 2: click transient — short noise burst for attack
    const clickGain = this.ctx.createGain();
    clickGain.gain.setValueAtTime(intensity * 0.15, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    clickGain.connect(this.masterGain);

    const clickOsc = this.ctx.createOscillator();
    clickOsc.type = 'square';
    clickOsc.frequency.setValueAtTime(150, now);
    clickOsc.frequency.exponentialRampToValueAtTime(60, now + 0.03);
    clickOsc.connect(clickGain);
    clickOsc.start(now);
    clickOsc.stop(now + 0.04);
  }

  /**
   * Set master volume.
   *
   * @param {number} volume — 0 to 1
   */
  setVolume(volume) {
    if (this.masterGain) {
      this.masterGain.gain.value = Math.max(0, Math.min(1, volume));
    }
  }

  /** Dispose of audio resources. */
  dispose() {
    if (this._droneRunning) {
      this._droneOsc1.stop();
      this._droneOsc2.stop();
      this._droneOsc1 = null;
      this._droneOsc2 = null;
      this._droneGain = null;
      this._droneRunning = false;
    }
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close();
    }
    this._initialized = false;
  }
}
