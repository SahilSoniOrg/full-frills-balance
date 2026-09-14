import { AppButton, AppInput, AppText } from '@/src/components/core';
import { PrivacyAcknowledgementSheet } from '@/src/components/legal/PrivacyAcknowledgementSheet';
import { AppConfig, Spacing, Typography } from '@/src/constants';
import { ONBOARDING_V2_STRINGS as copy } from '@/src/constants/copy/domains/onboardingV2Strings';
import { PRIVACY_NOTICE_STRINGS } from '@/src/constants/copy/domains/privacyNoticeStrings';
import { Box, Stack } from '@/src/design-system';
import { useState } from 'react';
import { Keyboard, ScrollView, StyleSheet } from 'react-native';

export function WelcomeScene({
  name,
  onNameChange,
  privacyAcknowledged,
  onAcknowledgePrivacy,
  onPrivacyNotice,
  onStart,
  onRestore,
}: {
  readonly name: string;
  readonly onNameChange: (name: string) => void;
  readonly privacyAcknowledged: boolean;
  readonly onAcknowledgePrivacy: () => void;
  readonly onPrivacyNotice: () => void;
  readonly onStart: () => void;
  readonly onRestore: () => void;
}) {
  const [pending, setPending] = useState<'start' | 'restore' | null>(null);
  const [prompt, setPrompt] = useState(false);
  const splash = AppConfig.strings.onboarding.splash;
  const trimmed = (name ?? '').trim();

  const run = (action: 'start' | 'restore') => {
    if (action === 'start' && !trimmed) return;
    Keyboard.dismiss();
    if (!privacyAcknowledged) {
      setPending(action);
      setPrompt(true);
      return;
    }
    if (action === 'start') onStart();
    else onRestore();
  };

  return (
    <>
      <Box flex={1} testID="onboarding-v2-welcome">
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Stack gap="xxxl" flex={1} justify="center">
            <Stack gap={Spacing.xxxxl + Spacing.xxl}>
              <Stack gap="md" paddingTop="xl" align="center">
                <AppText variant="caption" color="primary" weight="semibold" style={styles.eyebrow}>
                  {splash.eyebrow}
                </AppText>
                <AppText variant="hero" style={styles.title}>
                  {splash.title}
                </AppText>
                <AppText variant="body" color="secondary" style={styles.subtitle}>
                  {splash.subtitle}
                </AppText>
              </Stack>

              <Stack gap="lg" marginHorizontal="md">
                <AppInput
                  label={splash.inputLabel}
                  placeholder={splash.inputPlaceholder}
                  value={name ?? ''}
                  onChangeText={onNameChange}
                  autoCapitalize="words"
                  autoCorrect={false}
                  accessibilityLabel={splash.inputLabel}
                  testID="onboarding-v2-you-input"
                  returnKeyType="next"
                  onSubmitEditing={() => run('start')}
                />
                <AppButton
                  variant="primary"
                  size="lg"
                  onPress={() => run('start')}
                  disabled={!trimmed}
                  testID="onboarding-v2-start"
                >
                  {splash.btnGetStarted}
                </AppButton>
                <Stack gap="xs" align="center">
                  <AppText variant="caption" color="secondary">
                    {splash.restorePrompt}
                  </AppText>
                  <AppButton
                    variant="ghost"
                    size="md"
                    onPress={() => run('restore')}
                    testID="onboarding-v2-restore"
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
                accessibilityLabel={PRIVACY_NOTICE_STRINGS.onboardingAction}
                testID="onboarding-privacy-notice-button"
              >
                {PRIVACY_NOTICE_STRINGS.onboardingAction}
              </AppButton>
            </Stack>
          </Stack>
        </ScrollView>
      </Box>
      <PrivacyAcknowledgementSheet
        visible={prompt}
        onClose={() => {
          setPrompt(false);
          setPending(null);
        }}
        onOpenFullPolicy={() => {
          setPrompt(false);
          setPending(null);
          onPrivacyNotice();
        }}
        onAcknowledge={() => {
          onAcknowledgePrivacy();
          setPrompt(false);
          const action = pending;
          setPending(null);
          if (action === 'start') onStart();
          else if (action === 'restore') onRestore();
        }}
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
