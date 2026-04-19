import { ColorKey, ElevationKey, RadiusKey } from '@/src/constants/design-tokens';
import { Box, BoxBaseProps } from '@/src/design-system/Box';
import React, { forwardRef } from 'react';
import { View, type ViewProps } from 'react-native';

export type AppSurfaceBaseProps = BoxBaseProps & {
  elevation?: ElevationKey;
  radius?: RadiusKey;
  background?: ColorKey;
} & Omit<ViewProps, keyof BoxBaseProps>;

export type AppSurfaceProps = AppSurfaceBaseProps;

export const AppSurface = forwardRef<View, AppSurfaceProps>((props, ref) => {
  const { elevation = 'sm', radius = 'r2', background, children, ...boxProps } = props;

  return (
    <Box ref={ref} background={background} borderRadius={radius} shadow={elevation} {...boxProps}>
      {children}
    </Box>
  );
});

AppSurface.displayName = 'AppSurface';
