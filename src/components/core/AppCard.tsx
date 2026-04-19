import {
  ColorKey,
  ElevationKey,
  OpacityKey,
  RadiusKey,
  SpacingKey,
} from '@/src/constants/design-tokens';
import { Box, BoxBaseProps } from '@/src/design-system/Box';
import { extractBoxProps } from '@/src/design-system/utils';
import React, { forwardRef } from 'react';
import { View, type ViewProps } from 'react-native';

type AppCardPadding = 'none' | 'sm' | 'md' | 'lg';

export type AppCardBaseProps = Omit<BoxBaseProps, 'padding'> & {
  elevation?: ElevationKey;
  paddingSize?: AppCardPadding;
  /** @deprecated use paddingSize for card padding, or numeric/non-card tokens for raw Box padding */
  padding?: AppCardPadding | BoxBaseProps['padding'];
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

function isCardPadding(value: AppCardBaseProps['padding']): value is AppCardPadding {
  return value === 'none' || value === 'sm' || value === 'md' || value === 'lg';
}

export type AppCardProps = AppCardBaseProps;

export const AppCard = forwardRef<View, AppCardProps>((initialProps, ref) => {
  const {
    elevation: elevationProp,
    paddingSize,
    padding: legacyPadding,
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

  const paddingValue = paddingSize
    ? PADDING_MAP[paddingSize]
    : isCardPadding(legacyPadding)
      ? PADDING_MAP[legacyPadding]
      : (legacyPadding ?? PADDING_MAP.md);
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
