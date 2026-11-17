import { AppIcon, AppText, type IconName } from '@/src/components/core';
import { Opacity } from '@/src/constants';
import type { Theme } from '@/src/constants/design-tokens';
import { useTheme } from '@/src/hooks/use-theme';
import { withOpacity } from '@/src/design-system/colorMath';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Box, Stack } from '@/src/design-system';

export type NoticeBannerTone = 'info' | 'warning' | 'error' | 'neutral';

const NOTICE_BANNER_TONE_COLOR: Record<NoticeBannerTone, keyof Theme> = {
  error: 'error',
  warning: 'warning',
  info: 'primary',
  neutral: 'textSecondary',
};

export interface NoticeBannerProps {
  /** Bold first line; `message` then reads as secondary detail. */
  title?: string;
  message: string;
  tone?: NoticeBannerTone;
  icon?: IconName;
  /** Trailing control, e.g. a Retry button or spinner. */
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function NoticeBanner({
  title,
  message,
  tone = 'neutral',
  icon,
  action,
  style,
  testID,
}: NoticeBannerProps) {
  const { theme } = useTheme();
  const color = theme[NOTICE_BANNER_TONE_COLOR[tone]];

  return (
    <Box
      testID={testID}
      flexDirection="row"
      alignItems={action ? 'center' : 'flex-start'}
      gap="xs"
      padding="sm"
      borderRadius="xxl"
      unsafe_backgroundRaw={withOpacity(color, Opacity.soft)}
      style={style}
      accessibilityRole="alert"
    >
      {icon ? <AppIcon name={icon} size={16} color={color} /> : null}
      {title ? (
        <Stack gap="xs" flex={1}>
          <AppText variant="caption" weight="semibold" style={{ color }}>
            {title}
          </AppText>
          <AppText variant="caption" color="secondary">
            {message}
          </AppText>
        </Stack>
      ) : (
        <AppText variant="caption" weight="semibold" style={{ flex: 1, color }}>
          {message}
        </AppText>
      )}
      {action}
    </Box>
  );
}
