import { AppButton, AppIcon, AppText } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { Box, Stack } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet } from 'react-native';

interface StepFinalizeProps {
  onFinish: () => void;
  isCompleting: boolean;
}

export const StepFinalize: React.FC<StepFinalizeProps> = ({ onFinish, isCompleting }) => {
  const { theme } = useTheme();

  return (
    <Box flex={1}>
      <Stack
        flex={1}
        align="center"
        justify="center"
        gap="xl"
        paddingHorizontal="lg"
        paddingVertical="xl"
      >
        <AppIcon
          name="checkCircle"
          size={AppConfig.layout.finalizeIconSize}
          color={theme.primary}
        />

        <Stack gap="md" align="center">
          <AppText variant="title" style={styles.centeredText}>
            {AppConfig.strings.onboarding.finalize.title}
          </AppText>

          <AppText variant="body" color="secondary" style={styles.subtitle}>
            {AppConfig.strings.onboarding.finalize.subtitle}
          </AppText>
        </Stack>

        <Box width="100%" marginTop="lg">
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
        </Box>
      </Stack>
    </Box>
  );
};

const styles = StyleSheet.create({
  centeredText: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    maxWidth: AppConfig.layout.finalizeSubtitleMaxWidth,
  },
  finishButton: {
    width: '100%',
  },
});
