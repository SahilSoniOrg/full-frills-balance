import {
  ColorKey,
  getContextualTokens,
  getFontTheme,
  getThemeColors,
} from '@/src/constants/design-tokens';
import { useThemeOverride, useUI } from '@/src/contexts/UIContext';
import { getWCAGContrastColor } from '@/src/utils/color-math';
import { ComponentVariant, getVariantColors } from '@/src/utils/style-helpers';
import { useCallback, useMemo } from 'react';

export function useTheme() {
  const { themeMode: uiThemeMode, themeId, fontId } = useUI();
  const themeOverride = useThemeOverride();
  const themeMode = themeOverride ?? uiThemeMode;

  // Resolve dynamic theme and fonts
  const theme = getThemeColors(themeId, themeMode);
  const fonts = getFontTheme(fontId);
  const tokens = getContextualTokens(theme);

  /**
   * Contrast Engine - Memoized to prevent redundant calculations
   */
  const onContrastRaw = useMemo(() => {
    const cache = new Map<string, string>();
    return (color: string) => {
      if (!color) return theme.text;
      if (cache.has(color)) return cache.get(color)!;

      const result = getWCAGContrastColor(
        color,
        theme.onHighContrastSurface,
        theme.onLowContrastSurface,
      );
      cache.set(color, result);
      return result;
    };
  }, [theme.onHighContrastSurface, theme.onLowContrastSurface, theme.text]);

  const onContrastToken = useCallback(
    (key: ColorKey) => {
      return onContrastRaw(theme[key] as string);
    },
    [theme, onContrastRaw],
  );

  /**
   * Unified behavioral API for contrast resolution.
   * Supports both theme tokens and raw hex strings.
   */
  const onContrast = useCallback(
    (colorOrToken: string | ColorKey) => {
      // Check if value is a valid theme key
      if (colorOrToken in theme) {
        return onContrastToken(colorOrToken as ColorKey);
      }
      return onContrastRaw(colorOrToken as string);
    },
    [theme, onContrastToken, onContrastRaw],
  );

  /**
   * Bound Variant Resolver - The exclusive way to resolve component styles
   */
  const resolveVariantColors = useCallback(
    (variant: ComponentVariant) => {
      return getVariantColors(theme, onContrastRaw, variant);
    },
    [theme, onContrastRaw],
  );

  return {
    theme,
    themeMode,
    themeId,
    fonts,
    tokens,
    onContrast,
    onContrastRaw,
    onContrastToken,
    getVariantColors: resolveVariantColors,
  };
}
