/**
 * HUD overlay module.
 * Manages biometric data display: HR, HRV, signal quality, coherence, sparkline.
 * Smooths values to avoid jittery updates and provides visual feedback.
 */

import { drawSparkline } from './rppg.js';

/** Smoothing factor for exponential moving average (0 = no smoothing, 1 = frozen). */
const SMOOTH_FACTOR = 0.3;

/** Maximum BPM history entries for the sparkline (~30 seconds at 1 Hz). */
const BPM_HISTORY_MAX = 30;

/** Quality threshold below which signal is considered poor. */
const QUALITY_THRESHOLD = 0.4;

/**
 * HUD — manages all heads-up display elements.
 */
export class HUD {
  /**
   * @param {object} elements — DOM element references
   * @param {HTMLElement} elements.hrValue
   * @param {HTMLElement} elements.hrvValue
   * @param {HTMLElement} elements.coherenceValue
   * @param {HTMLElement} elements.coherenceBar
   * @param {HTMLElement} elements.signalFill
   * @param {HTMLElement} elements.qualityText
   * @param {HTMLElement} elements.pulseDot
   * @param {HTMLCanvasElement} elements.sparkline
   */
  constructor(elements) {
    this.els = elements;
    this.bpmHistory = [];

    // Smoothed values for jitter-free display
    this._smoothHR = null;
    this._smoothHRV = null;
    this._smoothQuality = 0;
    this._smoothCoherence = 0;

    // Beat animation state
    this._beatActive = false;
    this._beatTimeout = null;
  }

  /**
   * Update the HUD with new biometric data.
   *
   * @param {{ hr: number|null, hrv: number|null, quality: number, coherence: number|undefined, pulse: number }} data
   */
  update(data) {
    this._updateHR(data.hr);
    this._updateHRV(data.hrv);
    this._updateQuality(data.quality);
    this._updateCoherence(data.coherence);
  }

  /**
   * Record a BPM sample for the sparkline (~1 Hz).
   *
   * @param {number} bpm
   */
  recordBPM(bpm) {
    this.bpmHistory.push(Math.round(bpm));
    if (this.bpmHistory.length > BPM_HISTORY_MAX) this.bpmHistory.shift();
    if (this.els.sparkline) {
      drawSparkline(this.els.sparkline, this.bpmHistory);
    }
  }

  /**
   * Flash the pulse dot on heartbeat detection.
   */
  triggerBeat() {
    if (!this.els.pulseDot) return;
    this.els.pulseDot.classList.add('beat');
    if (this._beatTimeout) clearTimeout(this._beatTimeout);
    this._beatTimeout = setTimeout(() => {
      this.els.pulseDot.classList.remove('beat');
    }, 300);
  }

  /** Smooth and display heart rate. */
  _updateHR(hr) {
    if (hr === null) return;
    if (this._smoothHR === null) {
      this._smoothHR = hr;
    } else {
      this._smoothHR += (hr - this._smoothHR) * (1 - SMOOTH_FACTOR);
    }
    if (this.els.hrValue) {
      this.els.hrValue.textContent = Math.round(this._smoothHR);
    }
  }

  /** Smooth and display HRV. */
  _updateHRV(hrv) {
    if (hrv === null) return;
    if (this._smoothHRV === null) {
      this._smoothHRV = hrv;
    } else {
      this._smoothHRV += (hrv - this._smoothHRV) * (1 - SMOOTH_FACTOR);
    }
    if (this.els.hrvValue) {
      this.els.hrvValue.textContent = Math.round(this._smoothHRV);
    }
  }

  /** Update signal quality bar, color, and percentage text. */
  _updateQuality(quality) {
    this._smoothQuality += (quality - this._smoothQuality) * (1 - SMOOTH_FACTOR);
    const pct = Math.round(this._smoothQuality * 100);

    if (this.els.signalFill) {
      this.els.signalFill.style.width = `${pct}%`;
      this.els.signalFill.style.backgroundColor =
        this._smoothQuality < QUALITY_THRESHOLD ? '#ffb703' : '#00f5d4';
    }
    if (this.els.qualityText) {
      this.els.qualityText.textContent = `${pct}%`;
    }
  }

  /** Update coherence score and bar fill. */
  _updateCoherence(coherence) {
    if (coherence === undefined) return;
    this._smoothCoherence += (coherence - this._smoothCoherence) * (1 - SMOOTH_FACTOR);
    const rounded = Math.round(this._smoothCoherence);

    if (this.els.coherenceValue) {
      this.els.coherenceValue.textContent = rounded;
    }
    if (this.els.coherenceBar) {
      this.els.coherenceBar.style.width = `${rounded}%`;
    }
  }

  /** Reset all smoothed values and history. */
  reset() {
    this._smoothHR = null;
    this._smoothHRV = null;
    this._smoothQuality = 0;
    this._smoothCoherence = 0;
    this.bpmHistory = [];
    if (this._beatTimeout) {
      clearTimeout(this._beatTimeout);
      this._beatTimeout = null;
    }
  }
}

/**
 * Create a HUD instance by querying DOM elements.
 * Returns null if critical elements are missing.
 *
 * @returns {HUD|null}
 */
export function createHUD() {
  const hrValue = document.getElementById('hr-value');
  const hrvValue = document.getElementById('hrv-value');
  const coherenceValue = document.getElementById('coherence-value');
  const coherenceBar = document.getElementById('coherence-fill');
  const signalFill = document.getElementById('signal-fill');
  const qualityText = document.getElementById('quality-text');
  const pulseDot = document.getElementById('pulse-dot');
  const sparkline = document.getElementById('sparkline');

  if (!hrValue) return null;

  return new HUD({
    hrValue,
    hrvValue,
    coherenceValue,
    coherenceBar,
    signalFill,
    qualityText,
    pulseDot,
    sparkline,
  });
}
