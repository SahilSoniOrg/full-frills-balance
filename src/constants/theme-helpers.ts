/**
 * Theme Hook - Enhanced theme system with design tokens
 * Provides access to design tokens with proper TypeScript support
 */

import { Colors, Shape, Spacing, ThemeMode, Typography } from '@/src/constants/design-tokens';
import { useColorScheme } from 'react-native';

/**
 * Common styles for react-native-ui-datepicker to ensure consistent appearance
 * across DateTimePickerModal and DateRangePicker.
 */
export const getDatePickerStyles = (theme: any) => ({
  selected: { backgroundColor: theme.primary },
  selected_label: { color: theme.onPrimary },
  header: { backgroundColor: 'transparent' },
  month_selector_label: { color: theme.text, fontFamily: Typography.fonts.bold },
  year_selector_label: { color: theme.text, fontFamily: Typography.fonts.bold },
  month_label: { color: theme.text, fontFamily: Typography.fonts.medium },
  year_label: { color: theme.text, fontFamily: Typography.fonts.medium },
  day_label: { color: theme.text, fontFamily: Typography.fonts.medium },
  weekday_label: { color: theme.textSecondary, fontFamily: Typography.fonts.regular },
  time_label: { color: theme.text, fontFamily: Typography.fonts.bold },
  time_selector_label: { color: theme.text, fontFamily: Typography.fonts.bold },
  time_selector: {
    backgroundColor: theme.surfaceSecondary,
    borderRadius: Shape.radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
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

// Enhanced theme colors with semantic naming
export const useThemeColors = (mode?: ThemeMode | 'system') => {
  const systemColorScheme = useColorScheme()

  // Resolve theme: explicit mode -> system preference -> fallback to light
  let resolvedMode = mode === 'system' ? systemColorScheme : mode
  if (!resolvedMode || (resolvedMode !== 'light' && resolvedMode !== 'dark')) {
    resolvedMode = systemColorScheme === 'dark' ? 'dark' : 'light'
  }

  return Colors[resolvedMode as 'light' | 'dark']
}

// Helper hook to get color by semantic name
export const useSemanticColor = (colorName: string, mode?: ThemeMode) => {
  const colors = useThemeColors(mode)
  return colors[colorName as keyof typeof colors] || colors.text
}

// Theme-aware style helpers
export const createThemedStyle = <T extends Record<string, any>>(
  lightStyles: T,
  darkStyles?: Partial<T>
) => {
  const useThemedStyles = (mode?: ThemeMode) => {
    const theme = mode || 'light'
    return theme === 'dark' ? { ...lightStyles, ...darkStyles } : lightStyles
  }

  return useThemedStyles
}

// === LUMINANCE & CONTRAST HELPERS ===

/**
 * Calculate relative luminance of a hex color
 * Formula: 0.2126 * R + 0.7152 * G + 0.0722 * B
 * where R, G, B are linear values
 */
export const getLuminance = (hex: string): number => {
  const cleanHex = hex.replace('#', '');
  const rIdx = cleanHex.length === 3 ? 0 : 0;
  const gIdx = cleanHex.length === 3 ? 1 : 2;
  const bIdx = cleanHex.length === 3 ? 2 : 4;
  const length = cleanHex.length === 3 ? 1 : 2;

  const extract = (start: number) => {
    const part = cleanHex.substring(start, start + length);
    const val = parseInt(length === 1 ? part + part : part, 16);
    const srgb = val / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
  };

  const r = extract(rIdx);
  const g = extract(gIdx);
  const b = extract(bIdx);

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/**
 * Get contrast color (White or Black) for a given background color
 */
export const getContrastColor = (backgroundColor: string): string => {
  const luminance = getLuminance(backgroundColor);
  // Ivy Wallet uses 0.5 as threshold
  return luminance > 0.5 ? '#111114' : '#FAFAFA';
};
