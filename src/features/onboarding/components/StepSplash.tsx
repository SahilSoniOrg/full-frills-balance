import { AppButton, AppInput, AppText } from '@/src/components/core';
import { AppConfig, Typography } from '@/src/constants';
import { useImport } from '@/src/hooks/use-import';
import React from 'react';
import { Keyboard, ScrollView, StyleSheet } from 'react-native';
import { Box, Inline, Inset, Stack } from '@/src/design-system';

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
        contentContainerStyle={{ flexGrow: 1, paddingVertical: 24 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Stack gap="xl" flex={1} justifyContent="space-between">
          <Stack gap="md" align="center" paddingTop="xl">
            <AppText variant="hero" style={{ textAlign: 'center' }}>
              {AppConfig.strings.onboarding.splash.title}
            </AppText>
            <AppText variant="body" color="secondary" style={{ textAlign: 'center' }}>
              {AppConfig.strings.onboarding.splash.subtitle}
            </AppText>
          </Stack>

          <Inset space="md">
            <Stack gap="xl">
              <AppInput
                label={AppConfig.strings.onboarding.splash.inputLabel}
                placeholder={AppConfig.strings.onboarding.splash.inputPlaceholder}
                value={name}
                onChangeText={setName}
                autoFocus
                accessibilityLabel={AppConfig.strings.onboarding.splash.inputLabel}
                testID="onboarding-name-input"
                onSubmitEditing={() => {
                  Keyboard.dismiss();
                  onContinue();
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
          </Inset>

          <Stack gap="lg" paddingBottom="lg">
            <Inline align="center" space="md" paddingHorizontal="xl">
              <Box flex={1} height={1} background="border" />
              <AppText variant="caption" color="secondary" style={styles.orText}>
                {AppConfig.strings.onboarding.splash.dividerOr}
              </AppText>
              <Box flex={1} height={1} background="border" />
            </Inline>

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
  orText: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: Typography.sizes.xs,
  },
});
