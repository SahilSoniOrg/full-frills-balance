import { NoticeBanner } from '@/src/components/shared/NoticeBanner';
import { Spacing } from '@/src/constants';
import { Icon } from '@/src/types/domainIcons';
import type { StyleProp, ViewStyle } from 'react-native';

export function EntryInlineError({
  message,
  style,
}: {
  message: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <NoticeBanner
      message={message}
      tone="error"
      icon={Icon.Error}
      style={[{ marginTop: Spacing.sm }, style]}
    />
  );
}
