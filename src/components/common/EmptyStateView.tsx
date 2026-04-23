import { AppButton } from '@/src/components/core/AppButton';
import { AppIcon, type IconName } from '@/src/components/core/AppIcon';
import { AppText } from '@/src/components/core/AppText';
import { Box, Stack } from '@/src/design-system';
import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';

export interface EmptyStateViewProps {
  title: string;
  subtitle?: string;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
}

/**
 * EmptyStateView - A modernized empty state component.
 * Supports icons, titles, subtitles, and primary actions.
 */
export function EmptyStateView({
  title,
  subtitle,
  icon,
  style,
  primaryActionLabel,
  onPrimaryAction,
}: EmptyStateViewProps) {
  return (
    <Box flex={1} justifyContent="center" alignItems="center" padding="xl" style={style}>
      <Stack gap="lg" alignItems="center">
        {icon && (
          <Box marginBottom="sm">
            <AppIcon name={icon} size={48} color="textSecondary" />
          </Box>
        )}
        <Stack gap="xs" alignItems="center">
          <AppText variant="heading" style={{ textAlign: 'center' }}>
            {title}
          </AppText>
          {subtitle && (
            <AppText variant="body" color="secondary" style={{ textAlign: 'center' }}>
              {subtitle}
            </AppText>
          )}
        </Stack>
        {primaryActionLabel && onPrimaryAction ? (
          <AppButton
            onPress={onPrimaryAction}
            accessibilityLabel={primaryActionLabel}
            style={{ marginTop: 8 }}
          >
            {primaryActionLabel}
          </AppButton>
        ) : null}
      </Stack>
    </Box>
  );
}
