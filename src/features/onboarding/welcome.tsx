import { AppButton, AppInput, AppText } from '@/src/components/core';
import { PrivacyAcknowledgementSheet } from '@/src/components/legal/PrivacyAcknowledgementSheet';
import { AppConfig, Spacing, Typography } from '@/src/constants';
import { ONBOARDING_STRINGS as copy } from '@/src/constants/copy/domains/onboardingStrings';
import { PRIVACY_NOTICE_STRINGS } from '@/src/constants/copy/domains/privacyNoticeStrings';
import { Box, Stack, useKeyboard } from '@/src/design-system';
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
  const [nameFocused, setNameFocused] = useState(false);
  const { isKeyboardVisible } = useKeyboard();
  const splash = AppConfig.strings.onboarding.splash;
  const trimmed = (name ?? '').trim();
  const inputMode = nameFocused || isKeyboardVisible;

  const run = (action: 'start' | 'restore') => {
    if (action === 'start' && !trimmed) return;
    setNameFocused(false);
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
      <Box flex={1} testID="onboarding-welcome">
        <KeyboardAvoidingView
          style={styles.keyboardAvoidingView}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              inputMode ? styles.inputModeScrollContent : undefined,
            ]}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
          >
            <Stack
              gap={inputMode ? 'xxl' : 'xxxl'}
              flex={1}
              justify={inputMode ? 'flex-start' : 'center'}
            >
              <Stack gap={inputMode ? 'xxl' : Spacing.xxxxl + Spacing.xxl}>
                <Stack gap="md" paddingTop={inputMode ? 'sm' : 'xl'} align="center">
                  <AppText
                    testID={
                      inputMode ? 'onboarding-welcome-input-context' : 'onboarding-welcome-hero'
                    }
                    variant="caption"
                    color="primary"
                    weight="semibold"
                    style={styles.eyebrow}
                  >
                    {splash.eyebrow}
                  </AppText>
                  <AppText
                    variant={inputMode ? 'heading' : 'hero'}
                    style={[styles.title, inputMode ? styles.focusedTitle : undefined]}
                  >
                    {splash.title}
                  </AppText>
                  {!inputMode ? (
                    <AppText variant="body" color="secondary" style={styles.subtitle}>
                      {splash.subtitle}
                    </AppText>
                  ) : null}
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
                    testID="onboarding-name-input"
                    returnKeyType="done"
                    onFocus={() => setNameFocused(true)}
                    onBlur={() => setNameFocused(false)}
                    onSubmitEditing={() => run('start')}
                  />
                  <AppButton
                    variant="primary"
                    size="lg"
                    onPress={() => run('start')}
                    disabled={!trimmed}
                    testID="onboarding-start"
                  >
                    {copy.startWithMoney}
                  </AppButton>
                </Stack>
              </Stack>
            </Stack>
          </ScrollView>

          <Box testID="onboarding-welcome-trust-actions">
            <Stack
              gap="xs"
              align="center"
              paddingHorizontal="md"
              paddingTop="sm"
              paddingBottom="sm"
            >
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
  inputModeScrollContent: {
    paddingTop: Spacing.sm,
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
  focusedTitle: {
    fontSize: Typography.sizes.xl,
    lineHeight: Typography.sizes.xl * Typography.lineHeights.tight,
  },
  subtitle: {
    maxWidth: 330,
    lineHeight: Typography.sizes.base * Typography.lineHeights.normal,
    textAlign: 'center',
  },
});
