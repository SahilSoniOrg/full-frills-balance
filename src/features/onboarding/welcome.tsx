import { AppButton, AppInput, AppText } from '@/src/components/core';
import { PrivacyAcknowledgementSheet } from '@/src/components/legal/PrivacyAcknowledgementSheet';
import { AppConfig, Spacing, Typography } from '@/src/constants';
import { ONBOARDING_STRINGS as copy } from '@/src/constants/copy/domains/onboardingStrings';
import { PRIVACY_NOTICE_STRINGS } from '@/src/constants/copy/domains/privacyNoticeStrings';
import { Box, Stack } from '@/src/design-system';
import { useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

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

  const trustActions = (
    <Box testID="onboarding-welcome-trust-actions">
      <Stack gap="xs" align="center" paddingHorizontal="md" paddingTop="sm" paddingBottom="sm">
        <Stack gap="xs" align="center">
          <AppText variant="caption" color="secondary">
            {splash.restorePrompt}
          </AppText>
          <AppButton
            variant="ghost"
            size="md"
            onPress={() => run('restore')}
            testID="onboarding-restore-button"
          >
            {copy.restoreBackup}
          </AppButton>
        </Stack>
        <Stack gap="xs" align="center">
          <AppText variant="caption" color="secondary" align="center">
            {copy.privacyFootnote}
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
    </Box>
  );

  return (
    <>
      <Box flex={1} testID="onboarding-welcome">
        <KeyboardAvoidingView
          style={styles.keyboardAvoidingView}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            keyboardShouldPersistTaps="handled"
          >
            <Stack flexGrow={1} justify="center" gap="xxxl" paddingVertical="md">
              <Stack gap="xxxl" align="center">
                <Stack gap="md" align="center" paddingHorizontal="md">
                  <AppText
                    testID="onboarding-welcome-hero"
                    variant="caption"
                    color="primary"
                    weight="semibold"
                    style={styles.eyebrow}
                  >
                    {splash.eyebrow}
                  </AppText>
                  <AppText variant="hero" style={styles.title}>
                    {splash.title}
                  </AppText>
                  <AppText variant="body" color="secondary" style={styles.subtitle}>
                    {splash.subtitle}
                  </AppText>
                </Stack>

                <Stack gap="lg" width="100%" paddingHorizontal="md">
                  <AppInput
                    label={splash.inputLabel}
                    placeholder={splash.inputPlaceholder}
                    value={name ?? ''}
                    onChangeText={onNameChange}
                    autoCapitalize="words"
                    autoCorrect={false}
                    accessibilityLabel={splash.inputLabel}
                    testID="onboarding-name-input"
                    returnKeyType="done"
                    onSubmitEditing={() => run('start')}
                  />
                  <AppButton
                    variant={trimmed ? 'primary' : 'secondary'}
                    size="lg"
                    onPress={() => run('start')}
                    disabled={!trimmed}
                    testID="onboarding-start"
                  >
                    {copy.startWithMoney}
                  </AppButton>
                </Stack>
              </Stack>

              {trustActions}
            </Stack>
          </ScrollView>
        </KeyboardAvoidingView>
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
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
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
