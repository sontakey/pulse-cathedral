/**
 * Mobile detection and device-capability helpers.
 * Used to adapt particle count, pixel ratio, and interaction patterns.
 */

/** Screen width threshold for mobile devices (px). */
const MOBILE_WIDTH_THRESHOLD = 768;

/** Maximum devicePixelRatio on mobile to prevent GPU overload. */
const MOBILE_MAX_DPR = 2;

/** Particle count for mobile (reduced from 2000 desktop). */
const MOBILE_PARTICLE_COUNT = 1000;

/** Particle count for desktop. */
const DESKTOP_PARTICLE_COUNT = 2000;

/**
 * Detect if the current device is mobile.
 * Uses a combination of screen width and user agent heuristics.
 *
 * @returns {boolean}
 */
export function detectMobile() {
  if (typeof window === 'undefined') return false;

  const narrowScreen = window.innerWidth <= MOBILE_WIDTH_THRESHOLD;

  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|Opera Mini|IEMobile/i.test(ua);

  return narrowScreen || mobileUA;
}

/**
 * Get the capped devicePixelRatio for rendering.
 * On mobile, caps at 2 to avoid GPU overload on high-DPI phones.
 *
 * @param {boolean} isMobile
 * @returns {number}
 */
export function getPixelRatio(isMobile) {
  if (typeof window === 'undefined') return 1;
  const dpr = window.devicePixelRatio || 1;
  return isMobile ? Math.min(dpr, MOBILE_MAX_DPR) : Math.min(dpr, 2);
}

/**
 * Get the appropriate particle count for the device.
 *
 * @param {boolean} isMobile
 * @returns {number}
 */
export function getParticleCount(isMobile) {
  return isMobile ? MOBILE_PARTICLE_COUNT : DESKTOP_PARTICLE_COUNT;
}

export {
  MOBILE_WIDTH_THRESHOLD,
  MOBILE_MAX_DPR,
  MOBILE_PARTICLE_COUNT,
  DESKTOP_PARTICLE_COUNT,
};
