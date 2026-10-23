import {
  ColorKey,
  getContextualTokens,
  getFontTheme,
  getThemeColors,
  type FontTheme,
} from '@/src/constants/design-tokens';
import { useAppReady } from '@/src/contexts/app-shell/appReady';
import { useThemeOverride } from '@/src/contexts/UIContext';
import { useThemePrefs } from '@/src/hooks/useThemePrefs';
import { blendColors, getWCAGContrastColor } from '@/src/utils/color-math';
import { isFontSetLoaded } from '@/src/utils/loadFontSet';
import { ComponentVariant, getVariantColors } from '@/src/utils/style-helpers';
import { useCallback, useMemo } from 'react';
import { Platform } from 'react-native';

const _contrastCache = new Map<string, string>();
const SYSTEM_FONT_FAMILY =
  Platform.select({ ios: 'System', android: 'sans-serif', default: 'system-ui' }) ?? 'system-ui';
const SYSTEM_FONTS: FontTheme = {
  regular: SYSTEM_FONT_FAMILY,
  medium: SYSTEM_FONT_FAMILY,
  semibold: SYSTEM_FONT_FAMILY,
  bold: SYSTEM_FONT_FAMILY,
  heading: SYSTEM_FONT_FAMILY,
  subheading: SYSTEM_FONT_FAMILY,
};

export function useTheme() {
  const { themeMode: uiThemeMode, themeId, fontId } = useThemePrefs();
  const { loadedFontId } = useAppReady();
  const themeOverride = useThemeOverride();
  const themeMode = themeOverride?.mode ?? uiThemeMode;
  const resolvedThemeId = themeOverride?.themeId ?? themeId;
  const requestedFontId = themeOverride?.fontId ?? fontId;
  const resolvedFontId = isFontSetLoaded(requestedFontId)
    ? requestedFontId
    : loadedFontId && isFontSetLoaded(loadedFontId)
      ? loadedFontId
      : null;

  // Resolve dynamic theme and fonts
  const theme = getThemeColors(resolvedThemeId, themeMode);
  const fonts = resolvedFontId ? getFontTheme(resolvedFontId) : SYSTEM_FONTS;
  const tokens = getContextualTokens(theme);

  /**
   * Contrast Engine - Memoized to prevent redundant calculations
   */
  const onContrastRaw = useMemo(() => {
    return (color: string) => {
      if (!color) return theme.text;
      if (_contrastCache.has(color)) return _contrastCache.get(color)!;

      const result = getWCAGContrastColor(
        color,
        theme.onHighContrastSurface,
        theme.onLowContrastSurface,
      );
      _contrastCache.set(color, result);
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
      if (Object.prototype.hasOwnProperty.call(theme, colorOrToken)) {
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
    themeId: resolvedThemeId,
    fonts,
    tokens,
    onContrast,
    blend: (color: string, alpha: number) => blendColors(color, theme.surface, alpha),
    getVariantColors: resolveVariantColors,
  };
}
