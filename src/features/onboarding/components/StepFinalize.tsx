import { AppButton, AppIcon, AppText } from '@/src/components/core';
import { AppConfig, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet, View } from 'react-native';

interface StepFinalizeProps {
  onFinish: () => void;
  isCompleting: boolean;
}

export const StepFinalize: React.FC<StepFinalizeProps> = ({ onFinish, isCompleting }) => {
  const { theme } = useTheme();

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <AppIcon
          name="checkCircle"
          size={AppConfig.layout.finalizeIconSize}
          color={theme.primary}
        />
      </View>

      <AppText variant="title" style={styles.title}>
        {AppConfig.strings.onboarding.finalize.title}
      </AppText>

      <AppText variant="body" color="secondary" style={styles.subtitle}>
        {AppConfig.strings.onboarding.finalize.subtitle}
      </AppText>

      <View style={styles.buttonContainer}>
        <AppButton
          variant="primary"
          size="lg"
          onPress={onFinish}
          loading={isCompleting}
          style={styles.finishButton}
          testID="onboarding-finish-button"
        >
          {AppConfig.strings.onboarding.finalize.btnFinish}
        </AppButton>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
  },
  iconContainer: {
    marginBottom: Spacing.xl,
  },
  title: {
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: Spacing.xxxl,
    maxWidth: AppConfig.layout.finalizeSubtitleMaxWidth,
  },
  buttonContainer: {
    width: '100%',
    marginTop: Spacing.lg,
  },
  finishButton: {
    width: '100%',
  },
});
