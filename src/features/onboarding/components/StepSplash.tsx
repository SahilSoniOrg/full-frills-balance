import { AppButton, AppInput, AppText } from '@/src/components/core';
import { AppConfig, Spacing, Typography } from '@/src/constants';
import { useImport } from '@/src/hooks/use-import';
import React from 'react';
import { Keyboard, ScrollView, StyleSheet } from 'react-native';
import { Box, Stack } from '@/src/design-system';

interface StepSplashProps {
  name: string;
  setName: (name: string) => void;
  onContinue: () => void;
  onImport: () => void;
  isCompleting: boolean;
}

export const StepSplash: React.FC<StepSplashProps> = ({
  name,
  setName,
  onContinue,
  onImport,
  isCompleting,
}) => {
  const { isImporting } = useImport();

  return (
    <Box flex={1}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Stack gap="xxxl" flex={1} justify="center">
          <Stack gap={Spacing.xxxxl + Spacing.xxl}>
            <Stack gap="md" paddingTop="xl" align="center">
              <AppText variant="caption" color="primary" weight="semibold" style={styles.eyebrow}>
                {AppConfig.strings.onboarding.splash.eyebrow}
              </AppText>
              <AppText variant="hero" style={styles.title}>
                {AppConfig.strings.onboarding.splash.title}
              </AppText>
              <AppText variant="body" color="secondary" style={styles.subtitle}>
                {AppConfig.strings.onboarding.splash.subtitle}
              </AppText>
            </Stack>

            <Stack gap="lg" marginHorizontal="md">
              <AppInput
                label={AppConfig.strings.onboarding.splash.inputLabel}
                placeholder={AppConfig.strings.onboarding.splash.inputPlaceholder}
                value={name}
                onChangeText={setName}
                accessibilityLabel={AppConfig.strings.onboarding.splash.inputLabel}
                testID="onboarding-name-input"
                returnKeyType="next"
                onSubmitEditing={() => {
                  if (name.trim()) {
                    Keyboard.dismiss();
                    onContinue();
                  }
                }}
              />

              <AppButton
                variant="primary"
                size="lg"
                onPress={() => {
                  Keyboard.dismiss();
                  onContinue();
                }}
                disabled={!name.trim() || isCompleting}
                accessibilityLabel={AppConfig.strings.onboarding.splash.btnGetStarted}
                testID="onboarding-continue-button"
              >
                {AppConfig.strings.onboarding.splash.btnGetStarted}
              </AppButton>
            </Stack>
          </Stack>

          <Stack gap="xs" align="center">
            <AppText variant="caption" color="secondary">
              {AppConfig.strings.onboarding.splash.restorePrompt}
            </AppText>
            <AppButton
              variant="ghost"
              size="md"
              onPress={onImport}
              loading={isImporting}
              disabled={isImporting || isCompleting}
              accessibilityLabel={AppConfig.strings.onboarding.splash.btnRestore}
            >
              {AppConfig.strings.onboarding.splash.btnRestore}
            </AppButton>
          </Stack>
        </Stack>
      </ScrollView>
    </Box>
  );
};

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
