import { Typography } from '@/src/constants/design-tokens';
import { resolveStyleColors } from '@/src/design-system/utils';
import { useTheme } from '@/src/hooks/use-theme';
import { ComponentVariant } from '@/src/utils/style-helpers';
import { memo, useMemo } from 'react';
import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

export type AppTextProps = TextProps & {
  variant?:
    | 'caption'
    | 'bodySmall'
    | 'body'
    | 'bodyLarge'
    | 'subheading'
    | 'heading'
    | 'title'
    | 'xl'
    | 'hero';
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
  tabular = true,
  style,
  children,
  ...props
}: AppTextProps) {
  const { fonts, getVariantColors, theme, themeMode } = useTheme();

  const textStyle = useMemo(() => {
    const typographyStyles = (() => {
      switch (variant) {
        case 'caption':
          return styles.caption;
        case 'bodySmall':
          return styles.bodySmall;
        case 'body':
          return styles.body;
        case 'bodyLarge':
          return styles.bodyLarge;
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
      // Dark mode weight compensation: light-on-dark text reads optically thinner,
      // so bump body/caption weight up one step for readability parity with light mode.
      const compensatedWeight =
        themeMode === 'dark' && ['caption', 'bodySmall', 'body', 'bodyLarge'].includes(variant)
          ? weight === 'regular'
            ? 'medium'
            : weight === 'medium'
              ? 'semibold'
              : weight
          : weight;
      // For body/caption sizes, delegate to the weight prop to select the right Sans-Serif file
      return fonts[compensatedWeight] || fonts.regular;
    })();

    const variantColors = getVariantColors(color);

    const baseStyle = {
      ...typographyStyles,
      color: variantColors.main,
      textAlign: align,
      fontFamily: resolvedFontFamily,
      fontStyle: (italic ? 'italic' : 'normal') as 'italic' | 'normal',
      fontVariant: tabular ? (['tabular-nums'] as TextStyle['fontVariant']) : undefined,
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
    themeMode,
  ]);

  return (
    <Text
      textBreakStrategy={Typography.androidDefaults.textBreakStrategy}
      style={textStyle}
      {...props}
    >
      {children}
    </Text>
  );
});

const styles = StyleSheet.create({
  caption: {
    fontSize: Typography.sizes.xs,
    // Micro-copy (<30 chars) gets tight leading — compact labels, badges, dates
    lineHeight: Math.round(Typography.sizes.xs * Typography.lineHeights.tight),
    letterSpacing: Typography.letterSpacing.normal,
  },
  bodySmall: {
    fontSize: Typography.sizes.sm,
    lineHeight: Math.round(Typography.sizes.sm * Typography.lineHeights.normal),
    letterSpacing: Typography.letterSpacing.normal,
  },
  body: {
    fontSize: Typography.sizes.base,
    lineHeight: Math.round(Typography.sizes.base * Typography.lineHeights.normal),
    letterSpacing: Typography.letterSpacing.normal,
  },
  bodyLarge: {
    fontSize: Typography.sizes.lg,
    lineHeight: Math.round(Typography.sizes.lg * Typography.lineHeights.normal),
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
