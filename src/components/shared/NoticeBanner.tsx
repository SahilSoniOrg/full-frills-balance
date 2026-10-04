import { AppIcon, AppText, type IconName } from '@/src/components/core';
import { Opacity } from '@/src/constants';
import type { Theme } from '@/src/constants/design-tokens';
import { useTheme } from '@/src/hooks/use-theme';
import { withOpacity } from '@/src/utils/color-math';
import type { StyleProp, ViewStyle } from 'react-native';
import { Box } from '@/src/design-system';

export type NoticeBannerTone = 'info' | 'warning' | 'error' | 'neutral';

const NOTICE_BANNER_TONE_COLOR: Record<NoticeBannerTone, keyof Theme> = {
  error: 'error',
  warning: 'warning',
  info: 'primary',
  neutral: 'textSecondary',
};

export interface NoticeBannerProps {
  message: string;
  tone?: NoticeBannerTone;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function NoticeBanner({
  message,
  tone = 'neutral',
  icon,
  style,
  testID,
}: NoticeBannerProps) {
  const { theme } = useTheme();
  const color = theme[NOTICE_BANNER_TONE_COLOR[tone]];

  return (
    <Box
      testID={testID}
      flexDirection="row"
      alignItems="flex-start"
      gap="xs"
      padding="sm"
      borderRadius="r2"
      unsafe_backgroundRaw={withOpacity(color, Opacity.soft)}
      style={style}
      accessibilityRole="alert"
    >
      {icon ? <AppIcon name={icon} size={16} color={color} /> : null}
      <AppText variant="caption" weight="semibold" style={{ flex: 1, color }}>
        {message}
      </AppText>
    </Box>
  );
}
