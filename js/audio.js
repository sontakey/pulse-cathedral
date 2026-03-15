/**
 * Web Audio API module.
 * Ambient drone + heartbeat thud sound.
 */

/**
 * AudioManager — manages the Web Audio context and sounds.
 */
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this._initialized = false;
  }

  /**
   * Initialize the Web Audio context.
   * Must be called from a user gesture handler.
   */
  init() {
    if (this._initialized) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.3;
    this.masterGain.connect(this.ctx.destination);
    this._initialized = true;
  }

  /**
   * Play a heartbeat thud sound.
   *
   * @param {number} intensity — 0 to 1
   */
  playBeat(intensity = 0.5) {
    if (!this._initialized) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(55, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.15);

    gain.gain.setValueAtTime(intensity * 0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.25);
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
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close();
    }
    this._initialized = false;
  }
}
