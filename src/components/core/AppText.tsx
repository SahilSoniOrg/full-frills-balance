import { Typography } from '@/src/constants/design-tokens';
import { useUI } from '@/src/contexts/UIContext';
import { processTextChildren, resolveStyleColors } from '@/src/design-system/utils';
import { useTheme } from '@/src/hooks/use-theme';
import { logger } from '@/src/utils/logger';
import { ComponentVariant } from '@/src/utils/style-helpers';
import React, { memo, useMemo } from 'react';
import { StyleSheet, Text, type TextProps } from 'react-native';

export type AppTextProps = TextProps & {
  variant?: 'caption' | 'body' | 'subheading' | 'heading' | 'title' | 'xl' | 'hero';
  color?: ComponentVariant;
  align?: 'auto' | 'left' | 'right' | 'center' | 'justify';
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
  italic?: boolean;
  tabular?: boolean;
};

export const AppText = memo(function AppText({
  variant = 'body',
  color = 'text',
  align = 'auto',
  weight = 'regular',
  italic = false,
  tabular = false,
  style,
  children,
  ...props
}: AppTextProps) {
  const { fonts, getVariantColors, theme } = useTheme();
  const { fontsReady, loadedFontId, fontId } = useUI();

  const processedChildren = useMemo(() => processTextChildren(children), [children]);

  const textStyle = useMemo(() => {
    const typographyStyles = (() => {
      switch (variant) {
        case 'caption':
          return styles.caption;
        case 'body':
          return styles.body;
        case 'subheading':
          return styles.subheading;
        case 'heading':
          return styles.heading;
        case 'title':
          return styles.title;
        case 'xl':
          return styles.xl;
        case 'hero':
          return styles.hero;
        default:
          return styles.body;
      }
    })();

    const resolvedFontFamily = (() => {
      // For heading variants, strictly use the heading font (Serif)
      if (['heading', 'title', 'xl', 'hero'].includes(variant)) {
        return fonts.heading;
      }
      // For subheading, use the specific subheading definition
      if (variant === 'subheading') {
        return fonts.subheading;
      }
      // For body/caption, delegate to the weight prop to select the right Sans-Serif file
      return fonts[weight] || fonts.regular;
    })();

    // Safety: If fonts are not ready, log it to help diagnose rendering issues
    if (!fontsReady || loadedFontId !== fontId) {
      // Don't spam logger too much, just once per component mount if it happens
      logger.debug(
        `[AppText] Rendering before fonts ready! (fontsReady: ${fontsReady}, loaded: ${loadedFontId}, expected: ${fontId}, text: ${String(children).slice(0, 20)})`,
      );
    }

    const variantColors = getVariantColors(color);

    const baseStyle = {
      ...typographyStyles,
      color: variantColors.main,
      textAlign: align,
      fontFamily: resolvedFontFamily,
      fontStyle: (italic ? 'italic' : 'normal') as 'italic' | 'normal',
      fontVariant: (tabular ? ['tabular-nums'] : []) as any,
      ...Typography.androidDefaults,
    };

    return [baseStyle, resolveStyleColors(theme, style)];
  }, [
    variant,
    weight,
    color,
    getVariantColors,
    theme,
    fonts,
    align,
    italic,
    tabular,
    style,
    fontsReady,
    loadedFontId,
    fontId,
    children,
  ]);

  return (
    <Text
      textBreakStrategy={Typography.androidDefaults.textBreakStrategy}
      style={textStyle}
      {...props}
    >
      {processedChildren}
    </Text>
  );
});

const styles = StyleSheet.create({
  caption: {
    fontSize: Typography.sizes.xs,
    lineHeight: Math.round(Typography.sizes.xs * Typography.lineHeights.normal),
    letterSpacing: Typography.letterSpacing.normal,
  },
  body: {
    fontSize: Typography.sizes.base,
    lineHeight: Math.round(Typography.sizes.base * Typography.lineHeights.normal),
    letterSpacing: Typography.letterSpacing.normal,
  },
  subheading: {
    fontSize: Typography.sizes.lg,
    lineHeight: Math.round(Typography.sizes.lg * Typography.lineHeights.tight),
    letterSpacing: Typography.letterSpacing.tight,
  },
  heading: {
    fontSize: Typography.sizes.xl,
    lineHeight: Math.round(Typography.sizes.xl * Typography.lineHeights.tight),
    letterSpacing: Typography.letterSpacing.tight,
  },
  title: {
    fontSize: Typography.sizes.xxxl,
    lineHeight: Math.round(Typography.sizes.xxxl * Typography.lineHeights.tight),
    letterSpacing: Typography.letterSpacing.tight,
  },
  xl: {
    fontSize: Typography.sizes.xxl,
    lineHeight: Math.round(Typography.sizes.xxl * Typography.lineHeights.tight),
    letterSpacing: Typography.letterSpacing.tight,
  },
  hero: {
    fontSize: Typography.sizes.hero,
    lineHeight: Math.round(Typography.sizes.hero * Typography.lineHeights.tight),
    letterSpacing: Typography.letterSpacing.tight,
  },
});
