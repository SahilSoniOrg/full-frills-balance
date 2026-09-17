/**
 * Shared chrome motion — calm springs aligned with AppTabs / AppSegmentedControl.
 * Prefer these over one-off timing fades for enter/exit polish.
 */
export const ChromeMotion = {
  /** Settling spring for sheets, panels, and confirmation blooms. */
  spring: {
    type: 'spring' as const,
    damping: 18,
    stiffness: 240,
    mass: 0.8,
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
  /** How long save confirmation stays visible before leave. */
  saveConfirmMs: 320,
  /** Subtle dialog enter scale (not press-scale). */
  dialogFromScale: 0.96,
  /** Mode panel enter scale — barely perceptible. */
  panelFromScale: 0.985,
  /** Horizontal travel for directional mode swaps (px). */
  panelSlidePx: 14,
  /** Bottom sheet rise travel (px). */
  sheetRisePx: 36,
} as const;
