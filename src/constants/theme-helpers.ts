/**
 * Theme Hook - Enhanced theme system with design tokens
 * Provides access to design tokens with proper TypeScript support
 */

import { FontTheme, Shape, Spacing, Theme } from '@/src/constants/design-tokens';
import { useTheme } from '@/src/hooks/use-theme';

/**
 * Common styles for react-native-ui-datepicker to ensure consistent appearance
 * across DateTimePickerModal and DateRangePicker.
 */
export const getDatePickerStyles = (theme: Theme, fonts: FontTheme) => ({
  selected: { backgroundColor: theme.primary },
  selected_label: { color: theme.onPrimary },
  header: { backgroundColor: 'transparent' },
  month_selector_label: { color: theme.text, fontFamily: fonts.bold },
  year_selector_label: { color: theme.text, fontFamily: fonts.bold },
  month_label: { color: theme.text, fontFamily: fonts.medium },
  year_label: { color: theme.text, fontFamily: fonts.medium },
  day_label: { color: theme.text, fontFamily: fonts.medium },
  weekday_label: { color: theme.textSecondary, fontFamily: fonts.regular },
  time_label: { color: theme.text, fontFamily: fonts.bold },
  time_selector_label: { color: theme.text, fontFamily: fonts.bold },
  time_selector: {
    backgroundColor: theme.surfaceSecondary,
    borderRadius: Shape.radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs / 2, // Avoid magic numbers
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  time_selected_indicator: {
    backgroundColor: theme.primary,
    borderRadius: Shape.radius.md,
    marginVertical: 1,
  },
});

/**
 * Helper hook to get color by semantic name.
 * Now strictly follows the application theme without mode overrides.
 */
export const useSemanticColor = (colorName: keyof Theme) => {
  const { theme } = useTheme();
  return theme[colorName] || theme.text;
};

export { useTheme };

// === LUMINANCE & CONTRAST HELPERS ===

/**
 * Re-exporting core math primitives from the central utility.
 */
export { getLuminance } from '@/src/utils/color-math';
