import { SpacingKey, Typography } from '@/src/constants/design-tokens';
import { useTheme } from '@/src/hooks/use-theme';
import { ComponentVariant } from '@/src/utils/style-helpers';
import { useMemo } from 'react';
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { processTextChildren, resolveMarginSpacing, resolveStyleColors } from './utils';

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
  letterSpacing?: number;
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
  letterSpacing,
  style,
  children,
  ...props
}: TextProps) {
  const { fonts, getVariantColors, theme } = useTheme();

  const processedChildren = useMemo(() => processTextChildren(children), [children]);

  const textStyle = useMemo(() => {
    const fontSize = (() => {
      if (variant === 'subheading') return Typography.sizes.lg;
      if (variant === 'heading') return Typography.sizes.xl;
      return Typography.sizes[variant as keyof typeof Typography.sizes] || Typography.sizes.base;
    })();

    const isHeading = ['heading', 'title', 'xl', 'hero', 'xxl', 'xxxl'].includes(variant);

    // Line height logic based on variant
    // Micro-copy (xs/caption) gets tight leading; body text gets normal;
    // long-form content can pass explicit letterSpacing for relaxed.
    const lineHeightMultiplier =
      isHeading || variant === 'subheading' || variant === 'xs'
        ? Typography.lineHeights.tight
        : Typography.lineHeights.normal;

    const resolvedFontFamily = (() => {
      if (isHeading) return fonts.heading;
      if (variant === 'subheading') return fonts.subheading;
      return fonts[weight] || fonts.regular;
    })();

    const variantColors = getVariantColors(color);

    const baseStyle = {
      fontSize,
      lineHeight: Math.round(fontSize * lineHeightMultiplier),
      letterSpacing:
        letterSpacing ??
        (isHeading || variant === 'subheading'
          ? Typography.letterSpacing.tight
          : Typography.letterSpacing.normal),
      color: variantColors.main,
      textAlign: align,
      fontFamily: resolvedFontFamily,
      fontStyle: (italic ? 'italic' : 'normal') as TextStyle['fontStyle'],
      marginTop: resolveMarginSpacing(marginTop) as number | undefined,
      marginBottom: resolveMarginSpacing(marginBottom) as number | undefined,
      marginHorizontal: resolveMarginSpacing(marginHorizontal) as number | undefined,
      opacity,
      ...Typography.androidDefaults,
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
    letterSpacing,
    getVariantColors,
    theme,
    fonts,
    style,
  ]);

  return (
    <RNText
      textBreakStrategy={Typography.androidDefaults.textBreakStrategy}
      style={textStyle}
      {...props}
    >
      {processedChildren}
    </RNText>
  );
}
