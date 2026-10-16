import { AppText, PressScaleTouchable } from '@/src/components/core';
import { AppConfig, Size, Spacing } from '@/src/constants';

interface IncompleteFxWarningProps {
  message: string;
  testID?: string;
  onPress: () => void;
}

export function IncompleteFxWarning({ message, testID, onPress }: IncompleteFxWarningProps) {
  const reviewLabel = AppConfig.strings.common.incompleteFx.reviewDetails;

  return (
    <PressScaleTouchable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${message} ${reviewLabel}`}
      accessibilityHint="Opens details about amounts left out of this total."
      onPress={onPress}
      style={{ alignSelf: 'stretch' }}
      surfaceStyle={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        minHeight: Size.touchTarget,
      }}
    >
      <AppText variant="caption" color="warning" style={{ flexShrink: 1 }}>
        {message}
      </AppText>
      <AppText variant="caption" weight="bold" color="warning">
        {reviewLabel}
      </AppText>
    </PressScaleTouchable>
  );
}
