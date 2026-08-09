import {
  ColorKey,
  ElevationKey,
  OpacityKey,
  RadiusKey,
  SpacingKey,
} from '@/src/constants/design-tokens';
import { Box, BoxBaseProps } from '@/src/design-system/Box';
import { extractBoxProps } from '@/src/design-system/utils';
import { forwardRef } from 'react';
import { View, type ViewProps } from 'react-native';

type AppCardPadding = 'none' | 'sm' | 'md' | 'lg';

export type AppCardBaseProps = Omit<BoxBaseProps, 'padding'> & {
  elevation?: ElevationKey;
  paddingSize?: AppCardPadding;
  radius?: RadiusKey;
  variant?: 'default' | 'secondary' | 'outline' | 'ghost';
  background?: ColorKey;
  backgroundOpacity?: OpacityKey | number;
  borderColor?: ColorKey;
} & Omit<ViewProps, keyof BoxBaseProps>;

const CARD_VARIANTS: Record<NonNullable<AppCardBaseProps['variant']>, Partial<BoxBaseProps>> = {
  default: {
    background: 'surface',
    shadow: 'sm',
  },
  secondary: {
    background: 'surfaceSecondary',
    shadow: 'sm',
  },
  outline: {
    background: 'transparent',
    borderColor: 'border',
    borderWidth: 1,
    shadow: 'none',
  },
  ghost: {
    background: 'primary',
    backgroundOpacity: 'ghost',
    borderColor: 'primary',
    borderWidth: 1,
    shadow: 'none',
  },
};

const PADDING_MAP: Record<AppCardPadding, SpacingKey | number> = {
  none: 0,
  sm: 'md',
  md: 'lg',
  lg: 'xl',
};

export type AppCardProps = AppCardBaseProps;

export const AppCard = forwardRef<View, AppCardProps>((initialProps, ref) => {
  const {
    elevation: elevationProp,
    paddingSize = 'md',
    radius = 'r2',
    variant = 'default',
    children,
    ...propsWithoutCardProps
  } = initialProps;

  const { boxProps, restProps } = extractBoxProps(propsWithoutCardProps);

  const {
    style,
    background: backgroundProp,
    backgroundOpacity: backgroundOpacityProp,
    borderColor: borderColorProp,
    borderWidth: borderWidthProp,
    borderRadius,
    overflow,
    shadow: shadowProp,
    ...remainingBoxProps
  } = boxProps;

  const paddingValue = PADDING_MAP[paddingSize];
  const variantConfig = CARD_VARIANTS[variant];
  const resolvedElevation: ElevationKey | undefined =
    elevationProp === 'none' ? 'none' : elevationProp || shadowProp || variantConfig.shadow;
  const resolvedBackground = backgroundProp || variantConfig.background;
  const resolvedBackgroundOpacity = backgroundOpacityProp || variantConfig.backgroundOpacity;
  const resolvedBorderColor = borderColorProp || variantConfig.borderColor;
  const resolvedBorderWidth = borderWidthProp ?? variantConfig.borderWidth;

  return (
    <Box
      ref={ref}
      {...remainingBoxProps}
      {...restProps}
      style={style}
      background={resolvedBackground}
      backgroundOpacity={resolvedBackgroundOpacity}
      borderColor={resolvedBorderColor}
      borderWidth={resolvedBorderWidth}
      borderRadius={borderRadius ?? radius}
      shadow={resolvedElevation}
      overflow={overflow ?? 'hidden'}
      padding={paddingValue}
    >
      {children}
    </Box>
  );
});

AppCard.displayName = 'AppCard';
