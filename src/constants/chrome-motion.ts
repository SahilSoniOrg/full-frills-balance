/**
 * Shared Moti chrome tokens for overlays and panel swaps.
 * Prefer these over one-off timing fades for enter polish.
 */
export const ChromeMotion = {
  /** Settling spring for sheets and confirmation blooms. */
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
} as const;
