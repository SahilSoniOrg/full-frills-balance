import { Typography } from '@/src/constants/design-tokens';
import { resolveStyleColors } from '@/src/design-system/utils';
import { useTheme } from '@/src/hooks/use-theme';
import { ComponentVariant } from '@/src/utils/style-helpers';
import { memo, useMemo } from 'react';
import { Text, type TextProps, type TextStyle } from 'react-native';

export type AppTextProps = TextProps & {
  variant?: keyof typeof Typography.roles;
  /** Override the role's family, for example UI numerals at title size. */
  fontRole?: 'ui' | 'display' | 'numeric';
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
  weight,
  fontRole,
  italic = false,
  tabular = false,
  style,
  children,
  ...props
}: AppTextProps) {
  const { fonts, getVariantColors, theme } = useTheme();

  const textStyle = useMemo(() => {
    const isSection = variant === 'heading' || variant === 'subheading';
    const resolvedRole =
      fontRole ??
      (tabular ? 'numeric' : ['title', 'xl', 'hero'].includes(variant) ? 'display' : 'ui');
    const resolvedWeight = weight ?? (isSection ? 'semibold' : 'regular');
    // Serif display families ship a regular face, so never synthesize bold.
    // The single-family Raleway theme can use its actual weight files.
    const resolvedFontFamily =
      resolvedRole === 'display'
        ? fonts.heading === fonts.bold
          ? fonts[weight ?? 'bold']
          : fonts.heading
        : resolvedRole === 'numeric'
          ? (fonts.numeric ?? fonts)[resolvedWeight]
          : fonts[resolvedWeight];

    const variantColors = getVariantColors(color);

    const baseStyle = {
      ...Typography.roles[variant],
      color: variantColors.main,
      textAlign: align,
      fontFamily: resolvedFontFamily,
      fontStyle: (italic ? 'italic' : 'normal') as 'italic' | 'normal',
      fontVariant: tabular
        ? (['tabular-nums', 'lining-nums'] as TextStyle['fontVariant'])
        : undefined,
      ...Typography.androidDefaults,
    };

    return [baseStyle, resolveStyleColors(theme, style)];
  }, [
    variant,
    weight,
    fontRole,
    color,
    getVariantColors,
    theme,
    fonts,
    align,
    italic,
    tabular,
    style,
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
