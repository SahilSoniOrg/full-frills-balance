import { AppButton } from '@/src/components/core/AppButton';
import { AppIcon } from '@/src/components/core/AppIcon';
import { AppText } from '@/src/components/core/AppText';
import { Size, Spacing } from '@/src/constants';
import { Box, Stack } from '@/src/design-system';
import { StyleProp, ViewStyle } from 'react-native';
import type { IconName } from '@/src/types/domainIcons';

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
            <AppIcon name={icon} size={Size.xxl} color="textSecondary" />
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
            style={{ marginTop: Spacing.sm }}
          >
            {primaryActionLabel}
          </AppButton>
        ) : null}
      </Stack>
    </Box>
  );
}
