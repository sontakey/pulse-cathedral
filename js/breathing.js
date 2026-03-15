/**
 * Breathing guide module.
 * Guides 4-7-8 breathing pattern when HR is stable.
 * Renders a CSS-animated circle that expands (inhale), holds, and contracts (exhale).
 */

/** Breathing phase durations in seconds (4-7-8 technique). */
const INHALE_DURATION = 4;
const HOLD_DURATION = 7;
const EXHALE_DURATION = 8;
const CYCLE_DURATION = INHALE_DURATION + HOLD_DURATION + EXHALE_DURATION; // 19s

/** Number of consecutive stable readings before activating guide. */
const STABILITY_THRESHOLD = 10;

/** HR must stay within this BPM range to count as stable. */
const STABILITY_RANGE = 5;

/** Phase names. */
const PHASE_INHALE = 'inhale';
const PHASE_HOLD = 'hold';
const PHASE_EXHALE = 'exhale';

/**
 * BreathingGuide — manages the 4-7-8 breathing guide overlay.
 */
export class BreathingGuide {
  /**
   * @param {object} elements — DOM element references
   * @param {HTMLElement} elements.container — the breathing guide container
   * @param {HTMLElement} elements.circle — the breathing circle element
   * @param {HTMLElement} elements.label — the phase label element
   * @param {HTMLElement} elements.timer — the countdown timer element
   */
  constructor(elements) {
    this.els = elements;
    this._active = false;
    this._phase = PHASE_INHALE;
    this._cycleStart = null;
    this._stableCount = 0;
    this._lastHR = null;
    this._animationId = null;
  }

  /** Whether the breathing guide is currently active. */
  get active() {
    return this._active;
  }

  /** Current breathing phase: 'inhale', 'hold', or 'exhale'. */
  get phase() {
    return this._phase;
  }

  /**
   * Compute the breathing phase and progress from elapsed cycle time.
   *
   * @param {number} elapsed — seconds since cycle start
   * @returns {{ phase: string, progress: number, remaining: number }}
   */
  static computePhase(elapsed) {
    const t = elapsed % CYCLE_DURATION;

    if (t < INHALE_DURATION) {
      return {
        phase: PHASE_INHALE,
        progress: t / INHALE_DURATION,
        remaining: Math.ceil(INHALE_DURATION - t),
      };
    }

    if (t < INHALE_DURATION + HOLD_DURATION) {
      const holdElapsed = t - INHALE_DURATION;
      return {
        phase: PHASE_HOLD,
        progress: holdElapsed / HOLD_DURATION,
        remaining: Math.ceil(HOLD_DURATION - holdElapsed),
      };
    }

    const exhaleElapsed = t - INHALE_DURATION - HOLD_DURATION;
    return {
      phase: PHASE_EXHALE,
      progress: exhaleElapsed / EXHALE_DURATION,
      remaining: Math.ceil(EXHALE_DURATION - exhaleElapsed),
    };
  }

  /**
   * Check HR stability. Returns true when HR has been stable
   * for STABILITY_THRESHOLD consecutive readings.
   *
   * @param {number|null} hr — current heart rate
   * @returns {boolean}
   */
  checkStability(hr) {
    if (hr === null) {
      this._stableCount = 0;
      return false;
    }

    if (this._lastHR !== null && Math.abs(hr - this._lastHR) <= STABILITY_RANGE) {
      this._stableCount++;
    } else {
      this._stableCount = 1;
    }
    this._lastHR = hr;

    return this._stableCount >= STABILITY_THRESHOLD;
  }

  /**
   * Compute the circle scale for a given phase and progress.
   * Inhale: 0.3 → 1.0, Hold: 1.0, Exhale: 1.0 → 0.3.
   *
   * @param {string} phase
   * @param {number} progress — 0 to 1
   * @returns {number} scale factor (0.3–1.0)
   */
  static circleScale(phase, progress) {
    const MIN_SCALE = 0.3;
    const MAX_SCALE = 1.0;

    if (phase === PHASE_INHALE) {
      // Ease-out: smooth expansion
      const eased = 1 - (1 - progress) * (1 - progress);
      return MIN_SCALE + (MAX_SCALE - MIN_SCALE) * eased;
    }
    if (phase === PHASE_HOLD) {
      return MAX_SCALE;
    }
    // Exhale: ease-in for gradual start, accelerating contraction
    const eased = progress * progress;
    return MAX_SCALE - (MAX_SCALE - MIN_SCALE) * eased;
  }

  /** Activate the breathing guide. */
  activate() {
    if (this._active) return;
    this._active = true;
    this._cycleStart = performance.now();
    this._phase = PHASE_INHALE;

    if (this.els.container) {
      this.els.container.classList.add('visible');
    }

    this._tick();
  }

  /** Deactivate the breathing guide. */
  deactivate() {
    if (!this._active) return;
    this._active = false;
    this._cycleStart = null;
    this._stableCount = 0;

    if (this._animationId !== null) {
      cancelAnimationFrame(this._animationId);
      this._animationId = null;
    }

    if (this.els.container) {
      this.els.container.classList.remove('visible');
    }
  }

  /** Toggle the breathing guide on/off. */
  toggle() {
    if (this._active) {
      this.deactivate();
    } else {
      // Force activate regardless of stability
      this._stableCount = STABILITY_THRESHOLD;
      this.activate();
    }
  }

  /**
   * Update from biometric data. Automatically activates when HR is stable,
   * deactivates when unstable.
   *
   * @param {{ hr: number|null }} data
   */
  updateFromData(data) {
    const stable = this.checkStability(data.hr);
    if (stable && !this._active) {
      this.activate();
    } else if (!stable && this._active && this._stableCount < STABILITY_THRESHOLD) {
      this.deactivate();
    }
  }

  /** Animation tick — updates circle scale, phase label, and timer. */
  _tick() {
    if (!this._active) return;

    const elapsed = (performance.now() - this._cycleStart) / 1000;
    const { phase, progress, remaining } = BreathingGuide.computePhase(elapsed);

    this._phase = phase;

    // Update circle scale
    const scale = BreathingGuide.circleScale(phase, progress);
    if (this.els.circle) {
      this.els.circle.style.transform = `scale(${scale})`;
    }

    // Update label
    if (this.els.label) {
      const labels = { inhale: 'Breathe In', hold: 'Hold', exhale: 'Breathe Out' };
      this.els.label.textContent = labels[phase];
    }

    // Update timer countdown
    if (this.els.timer) {
      this.els.timer.textContent = remaining;
    }

    this._animationId = requestAnimationFrame(() => this._tick());
  }

  /**
   * Get the current breathing data for scene integration.
   *
   * @returns {{ active: boolean, phase: string, scale: number, progress: number }|null}
   */
  getBreathingData() {
    if (!this._active || this._cycleStart === null) return null;

    const elapsed = (performance.now() - this._cycleStart) / 1000;
    const { phase, progress } = BreathingGuide.computePhase(elapsed);
    const scale = BreathingGuide.circleScale(phase, progress);

    return { active: true, phase, scale, progress };
  }
}

/**
 * Create a BreathingGuide instance by querying DOM elements.
 *
 * @returns {BreathingGuide}
 */
export function createBreathingGuide() {
  const container = document.getElementById('breathing-guide');
  const circle = document.getElementById('breathing-circle');
  const label = document.getElementById('breathing-label');
  const timer = document.getElementById('breathing-timer');

  return new BreathingGuide({ container, circle, label, timer });
}

export {
  INHALE_DURATION,
  HOLD_DURATION,
  EXHALE_DURATION,
  CYCLE_DURATION,
  STABILITY_THRESHOLD,
  STABILITY_RANGE,
  PHASE_INHALE,
  PHASE_HOLD,
  PHASE_EXHALE,
};
