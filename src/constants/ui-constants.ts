/**
 * UI Constants - Layout, animation, and interaction values
 *
 * These complement design-tokens.ts (visual) and app-config.ts (behavior)
 * Centralizes magic numbers for consistent UI behavior and easier maintenance.
 */

export const UIConstants = {
  modal: {
    defaultHeight: '85%',
    dragHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
    },
  },

  chart: {
    donut: {
      defaultStrokeWidth: 20,
      defaultSize: 200,
    },
    line: {
      defaultHeight: 200,
      paddingVertical: 20,
      strokeWidth: 3,
    },
  },

  datePicker: {
    monthSlider: {
      initialIndex: 25,
      itemWidth: 120,
    },
  },


  animation: {
    scrollDelay: 100,
    dataRefreshDebounce: 300,
  },
} as const
