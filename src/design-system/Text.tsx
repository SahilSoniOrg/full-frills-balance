import { SpacingKey, Typography } from '@/src/constants/design-tokens';
import { useTheme } from '@/src/hooks/use-theme';
import { ComponentVariant } from '@/src/utils/style-helpers';
import React, { useMemo } from 'react';
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { resolveMarginSpacing, resolveStyleColors } from './utils';

export type TextProps = RNTextProps & {
  variant?: keyof typeof Typography.sizes | 'subheading' | 'heading';
  color?: ComponentVariant;
  align?: TextStyle['textAlign'];
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
  italic?: boolean;

  marginTop?: SpacingKey | number;
  marginBottom?: SpacingKey | number;
  marginHorizontal?: SpacingKey | number;
  opacity?: number;
};

export function Text({
  variant = 'base',
  color = 'text',
  align,
  weight = 'regular',
  italic = false,
  marginTop,
  marginBottom,
  marginHorizontal,
  opacity,
  style,
  ...props
}: TextProps) {
  const { fonts, getVariantColors, theme } = useTheme();

  const textStyle = useMemo(() => {
    const fontSize = (() => {
      if (variant === 'subheading') return Typography.sizes.lg;
      if (variant === 'heading') return Typography.sizes.xl;
      return Typography.sizes[variant as keyof typeof Typography.sizes] || Typography.sizes.base;
    })();

    const isHeading = ['heading', 'title', 'xl', 'hero', 'xxl', 'xxxl'].includes(variant);

    // Line height logic based on variant
    const lineHeightMultiplier =
      isHeading || variant === 'subheading'
        ? Typography.lineHeights.tight
        : Typography.lineHeights.normal;

    const letterSpacing =
      isHeading || variant === 'subheading'
        ? Typography.letterSpacing.tight
        : Typography.letterSpacing.normal;

    const resolvedFontFamily = (() => {
      if (isHeading) return fonts.heading;
      if (variant === 'subheading') return fonts.subheading;
      return fonts[weight] || fonts.regular;
    })();

    const variantColors = getVariantColors(color);

    const baseStyle = {
      fontSize,
      lineHeight: fontSize * lineHeightMultiplier,
      letterSpacing,
      color: variantColors.main,
      textAlign: align,
      fontFamily: resolvedFontFamily,
      fontStyle: (italic ? 'italic' : 'normal') as TextStyle['fontStyle'],
      marginTop: resolveMarginSpacing(marginTop) as any,
      marginBottom: resolveMarginSpacing(marginBottom) as any,
      marginHorizontal: resolveMarginSpacing(marginHorizontal) as any,
      opacity,
    };

    return [baseStyle, resolveStyleColors(theme, style)];
  }, [
    variant,
    color,
    align,
    weight,
    italic,
    marginTop,
    marginBottom,
    marginHorizontal,
    opacity,
    getVariantColors,
    theme,
    fonts,
    style,
  ]);

  return <RNText style={textStyle} {...props} />;
}
