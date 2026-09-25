import { AppText, PressScaleTouchable } from '@/src/components/core';
import { AppConfig, Spacing } from '@/src/constants';

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
      hitSlop={{ top: Spacing.sm, bottom: Spacing.sm }}
      style={{ alignSelf: 'stretch' }}
      surfaceStyle={{ gap: Spacing.xs, paddingVertical: Spacing.xs }}
    >
      <AppText variant="caption" color="warning">
        {message}
      </AppText>
      <AppText variant="caption" weight="bold" color="warning">
        {reviewLabel}
      </AppText>
    </PressScaleTouchable>
  );
}
