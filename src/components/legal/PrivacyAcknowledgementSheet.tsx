import { AppButton, AppCard, AppText } from '@/src/components/core';
import { InfoSheet } from '@/src/components/overlays/InfoSheet';
import { AppConfig, Spacing } from '@/src/constants';
import { Stack } from '@/src/design-system';
import { formatPrivacyPolicyEffectiveDate } from '@/src/services/legal/privacyPolicyAcceptance';
import { PRIVACY_NOTICE_STRINGS } from '@/src/constants/copy/domains/privacyNoticeStrings';

interface PrivacyAcknowledgementSheetProps {
  visible: boolean;
  onClose: () => void;
  onOpenFullPolicy: () => void;
  onAcknowledge: () => void;
}

export function PrivacyAcknowledgementSheet({
  visible,
  onClose,
  onOpenFullPolicy,
  onAcknowledge,
}: PrivacyAcknowledgementSheetProps) {
  const copy = PRIVACY_NOTICE_STRINGS;

  return (
    <InfoSheet
      visible={visible}
      title={copy.acknowledgementPromptTitle}
      onClose={onClose}
      maxHeightPercent={70}
      fixedHeight={false}
      accessibilityCloseLabel={copy.acknowledgementPromptClose}
      primaryAction={{
        label: copy.acknowledgementPromptAction,
        variant: 'primary',
        onPress: onAcknowledge,
      }}
    >
      <Stack gap="md">
        <AppText variant="body">{copy.acknowledgementPromptBody}</AppText>
        <AppCard variant="secondary" paddingSize="lg">
          <Stack gap="sm">
            <AppText variant="heading">{copy.acknowledgementPromptCalloutTitle}</AppText>
            <AppText variant="body" color="secondary">
              {copy.acknowledgementPromptCalloutBody}
            </AppText>
          </Stack>
        </AppCard>
        <AppText variant="caption" color="secondary">
          {copy.acknowledgementPromptDetails}
        </AppText>
        <AppButton
          variant="ghost"
          size="sm"
          style={{ alignSelf: 'flex-start' }}
          onPress={onOpenFullPolicy}
          accessibilityLabel={copy.fullPolicyAction}
          testID="privacy-acknowledgement-full-policy-button"
        >
          {copy.fullPolicyAction}
        </AppButton>
        <AppText variant="caption" color="secondary" style={{ marginTop: -Spacing.xs }}>
          {copy.effectiveDate(
            formatPrivacyPolicyEffectiveDate(AppConfig.legal.privacyPolicyVersion),
          )}
        </AppText>
      </Stack>
    </InfoSheet>
  );
}
