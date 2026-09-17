/**
 * Shared chrome motion tokens.
 * Moti params for overlays/panels; RN Animated.spring for indicator chrome.
 */
export const ChromeMotion = {
  /** Settling spring for sheets and confirmation blooms (Moti). */
  spring: {
    type: 'spring' as const,
    damping: 18,
    stiffness: 240,
    mass: 0.8,
  },
  /** Snappy panel swap — short timing (springs linger and felt ~1s with exitBeforeEnter). */
  panel: {
    type: 'timing' as const,
    duration: 160,
  },
  /** Softer settle for larger surfaces (bottom sheets). */
  sheetSpring: {
    type: 'spring' as const,
    damping: 20,
    stiffness: 200,
    mass: 0.9,
  },
  /** Backdrop / opacity only — timing keeps overlays predictable. */
  fade: {
    type: 'timing' as const,
    duration: 180,
  },
  /** Subtle dialog enter scale (not press-scale). */
  dialogFromScale: 0.96,
  /** Mode panel enter scale — barely perceptible. */
  panelFromScale: 0.99,
  /** Horizontal travel for directional mode swaps (px). */
  panelSlidePx: 10,
  /** Bottom sheet rise travel (px). */
  sheetRisePx: 36,
  /** Soft Y travel for dashboard STS amount settle (px). */
  settleRisePx: 6,
  /**
   * RN Animated.spring for tab / segmented / wheel indicators.
   * Moti damping/stiffness is a different API — do not mix these numbers.
   */
  rnIndicator: {
    friction: 10,
    tension: 60,
  },
  /** Softer RN spring for small chrome surfaces. */
  rnSoftSpring: {
    friction: 10,
    tension: 50,
  },
} as const;
