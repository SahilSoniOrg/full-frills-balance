import { AppText } from '@/src/components/core';
import { Box, Stack } from '@/src/design-system';
import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';

interface ScreenSectionHeaderProps {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * ScreenSectionHeader - A modernized header for screen sections.
 * Uses design-system primitives for layout and spacing.
 */
export function ScreenSectionHeader({ title, subtitle, action, style }: ScreenSectionHeaderProps) {
  return (
    <Box
      flexDirection="row"
      justifyContent="space-between"
      alignItems="center"
      gap="md"
      style={style}
    >
      <Stack gap="xs" flex={1}>
        {title ? (
          <AppText variant="subheading" weight="bold">
            {title}
          </AppText>
        ) : null}
        {subtitle ? (
          <AppText variant="caption" color="secondary">
            {subtitle}
          </AppText>
        ) : null}
      </Stack>
      {action ? <Box flexShrink={0}>{action}</Box> : null}
    </Box>
  );
}
