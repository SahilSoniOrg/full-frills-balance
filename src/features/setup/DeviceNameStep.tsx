import { KeyboardAwareScrollView } from '@/src/design-system/KeyboardAwareScrollView';
import { AppButton, AppInput, AppText } from '@/src/components/core';
import { Spacing, Typography } from '@/src/constants';
import { ONBOARDING_STRINGS as copy } from '@/src/constants/copy/domains/onboardingStrings';
import { Keyboard, StyleSheet } from 'react-native';
import { Box, Stack } from '@/src/design-system';
import { PRIVACY_NOTICE_STRINGS } from '@/src/constants/copy/domains/privacyNoticeStrings';
import { PrivacyAcknowledgementSheet } from '@/src/components/legal/PrivacyAcknowledgementSheet';
import { useAfterDismiss } from '@/src/components/overlays/useAfterDismiss';
import { useState } from 'react';

interface DeviceNameStepProps {
  name: string;
  setName: (name: string) => void;
  onContinue: () => void;
  onRestore: () => void;
  onPrivacyNotice: () => void;
  onAcknowledgePrivacyPolicy: () => void;
  isPrivacyPolicyAcknowledged: boolean;
  isCompleting: boolean;
}

export function DeviceNameStep({
  name,
  setName,
  onContinue,
  onRestore,
  onPrivacyNotice,
  onAcknowledgePrivacyPolicy,
  isPrivacyPolicyAcknowledged,
  isCompleting,
}: DeviceNameStepProps) {
  const [isPrivacyPromptVisible, setPrivacyPromptVisible] = useState(false);
  const [pendingAction, setPendingAction] = useState<'continue' | 'restore' | null>(null);
  const afterPrivacyDismiss = useAfterDismiss();

  const runAction = (action: 'continue' | 'restore') => {
    if (action === 'continue' && !name.trim()) return;
    Keyboard.dismiss();
    if (!isPrivacyPolicyAcknowledged) {
      afterPrivacyDismiss.cancel();
      setPendingAction(action);
      setPrivacyPromptVisible(true);
      return;
    }
    if (action === 'restore') onRestore();
    else onContinue();
  };

  const acknowledgePrivacyPolicy = () => {
    onAcknowledgePrivacyPolicy();
    const action = pendingAction;
    setPendingAction(null);
    if (action === 'restore') afterPrivacyDismiss.run(onRestore);
    else if (action === 'continue') afterPrivacyDismiss.run(onContinue);
    setPrivacyPromptVisible(false);
  };

  const openFullPrivacyPolicy = () => {
    setPendingAction(null);
    afterPrivacyDismiss.run(onPrivacyNotice);
    setPrivacyPromptVisible(false);
  };

  return (
    <>
      <Box flex={1} testID="onboarding-screen">
        <KeyboardAwareScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Stack gap="xxxl" flex={1} justify="center">
            <Stack gap={Spacing.xxxxl + Spacing.xxl}>
              <Stack gap="md" paddingTop="xl" align="center">
                <AppText variant="caption" color="primary" weight="semibold" style={styles.eyebrow}>
                  {copy.welcome.eyebrow}
                </AppText>
                <AppText variant="hero" style={styles.title}>
                  {copy.welcome.title}
                </AppText>
                <AppText variant="body" color="secondary" style={styles.subtitle}>
                  {copy.welcome.subtitle}
                </AppText>
              </Stack>

              <Stack gap="lg" marginHorizontal="md">
                <AppInput
                  label={copy.welcome.nameLabel}
                  placeholder={copy.welcome.namePlaceholder}
                  value={name}
                  onChangeText={setName}
                  accessibilityLabel={copy.welcome.nameLabel}
                  testID="onboarding-name-input"
                  returnKeyType="next"
                  onSubmitEditing={() => runAction('continue')}
                />

                <AppButton
                  variant="primary"
                  size="lg"
                  onPress={() => runAction('continue')}
                  disabled={!name.trim() || isCompleting}
                  accessibilityLabel={copy.startWithMoney}
                  testID="onboarding-continue-button"
                >
                  {copy.startWithMoney}
                </AppButton>

                <Stack gap="xs" align="center">
                  <AppText variant="caption" color="secondary">
                    {copy.welcome.restorePrompt}
                  </AppText>
                  <AppButton
                    variant="ghost"
                    size="md"
                    onPress={() => runAction('restore')}
                    disabled={isCompleting}
                    accessibilityLabel={copy.restoreBackup}
                    testID="onboarding-restore-button"
                  >
                    {copy.restoreBackup}
                  </AppButton>
                </Stack>
              </Stack>
            </Stack>

            <Stack gap="xs" align="center" paddingHorizontal="md" paddingBottom="sm">
              <AppText variant="caption" color="secondary" align="center">
                {PRIVACY_NOTICE_STRINGS.onboardingSummary}
              </AppText>
              <AppButton
                variant="ghost"
                size="sm"
                onPress={onPrivacyNotice}
                disabled={isCompleting}
                accessibilityLabel={PRIVACY_NOTICE_STRINGS.onboardingAction}
                testID="onboarding-privacy-notice-button"
              >
                {PRIVACY_NOTICE_STRINGS.onboardingAction}
              </AppButton>
            </Stack>
          </Stack>
        </KeyboardAwareScrollView>
      </Box>
      <PrivacyAcknowledgementSheet
        visible={isPrivacyPromptVisible}
        onClose={() => {
          afterPrivacyDismiss.cancel();
          setPrivacyPromptVisible(false);
          setPendingAction(null);
        }}
        onDismiss={afterPrivacyDismiss.onDismiss}
        onOpenFullPolicy={openFullPrivacyPolicy}
        onAcknowledge={acknowledgePrivacyPolicy}
      />
    </>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  eyebrow: {
    letterSpacing: Typography.letterSpacing.wide,
    textAlign: 'center',
  },
  title: {
    maxWidth: 350,
    fontSize: Typography.sizes.jumbo,
    lineHeight: Typography.sizes.jumbo * 1.04,
    letterSpacing: Typography.letterSpacing.tight,
    textAlign: 'center',
  },
  subtitle: {
    maxWidth: 330,
    lineHeight: Typography.sizes.base * Typography.lineHeights.normal,
    textAlign: 'center',
  },
});
