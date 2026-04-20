import { Typography } from '@/src/constants/design-tokens';
import { resolveStyleColors } from '@/src/design-system/utils';
import { useTheme } from '@/src/hooks/use-theme';
import { ComponentVariant } from '@/src/utils/style-helpers';
import { useMemo } from 'react';
import { StyleSheet, Text, type TextProps } from 'react-native';

export type AppTextProps = TextProps & {
  variant?: 'caption' | 'body' | 'subheading' | 'heading' | 'title' | 'xl' | 'hero';
  color?: ComponentVariant;
  align?: 'auto' | 'left' | 'right' | 'center' | 'justify';
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
  italic?: boolean;
  tabular?: boolean;
};

export function AppText({
  variant = 'body',
  color = 'text',
  align = 'auto',
  weight = 'regular',
  italic = false,
  tabular = false,
  style,
  ...props
}: AppTextProps) {
  const { fonts, getVariantColors, theme } = useTheme();

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

    const variantColors = getVariantColors(color);

    const baseStyle = [
      // Base styles (fontSize, lineHeight) - we intentionally override fontFamily below
      typographyStyles,
      {
        color: variantColors.main,
        textAlign: align,
        fontFamily: resolvedFontFamily,
        fontStyle: (italic ? 'italic' : 'normal') as 'italic' | 'normal',
        fontVariant: (tabular ? ['tabular-nums'] : []) as any,
      },
    ];

    return [baseStyle, resolveStyleColors(theme, style)];
  }, [variant, weight, color, getVariantColors, theme, fonts, align, italic, tabular, style]);

  return <Text style={textStyle} {...props} />;
}

const styles = StyleSheet.create({
  caption: {
    fontSize: Typography.sizes.xs,
    lineHeight: Typography.sizes.xs * Typography.lineHeights.normal,
    letterSpacing: Typography.letterSpacing.normal,
  },
  body: {
    fontSize: Typography.sizes.base,
    lineHeight: Typography.sizes.base * Typography.lineHeights.normal,
    letterSpacing: Typography.letterSpacing.normal,
  },
  subheading: {
    fontSize: Typography.sizes.lg,
    lineHeight: Typography.sizes.lg * Typography.lineHeights.tight,
    letterSpacing: Typography.letterSpacing.tight,
  },
  heading: {
    fontSize: Typography.sizes.xl,
    lineHeight: Typography.sizes.xl * Typography.lineHeights.tight,
    letterSpacing: Typography.letterSpacing.tight,
  },
  title: {
    fontSize: Typography.sizes.xxxl,
    lineHeight: Typography.sizes.xxxl * Typography.lineHeights.tight,
    letterSpacing: Typography.letterSpacing.tight,
  },
  xl: {
    fontSize: Typography.sizes.xxl,
    lineHeight: Typography.sizes.xxl * Typography.lineHeights.tight,
    letterSpacing: Typography.letterSpacing.tight,
  },
  hero: {
    fontSize: Typography.sizes.hero,
    lineHeight: Typography.sizes.hero * Typography.lineHeights.tight,
    letterSpacing: Typography.letterSpacing.tight,
  },
});
