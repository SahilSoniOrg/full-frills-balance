import { AppButton, AppText } from '@/src/components/core';
import { Size } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';

/** `accessory` sits in a group header on the screen background; `inline` sits inside a group card. */
export function DetailCaptionLink({
  label,
  onPress,
  placement = 'accessory',
  prefix,
  testID,
}: {
  label: string;
  onPress: () => void;
  placement?: 'accessory' | 'inline';
  prefix?: string;
  testID?: string;
}) {
  const { theme } = useTheme();
  const inline = placement === 'inline';
  return (
    <AppButton
      variant="ghost"
      size={inline ? undefined : 'sm'}
      onPress={onPress}
      accessibilityLabel={label}
      testID={testID}
      hitSlop={inline ? undefined : { top: 6, bottom: 6 }}
      buttonStyle={
        inline
          ? { minHeight: Size.touchTarget, alignSelf: 'flex-start', paddingHorizontal: 0 }
          : { minHeight: Size.buttonSm, paddingVertical: 0, paddingHorizontal: 0 }
      }
    >
      <AppText
        variant="caption"
        color="primary"
        weight="semibold"
        contrastOn={inline ? theme.surface : theme.background}
      >
        {prefix ? `${prefix} ${label}` : label}
      </AppText>
    </AppButton>
  );
}
