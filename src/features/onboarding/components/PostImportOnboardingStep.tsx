import { AppButton, AppText } from '@/src/components/core';
import { Box, Stack } from '@/src/design-system';
import { StyleSheet } from 'react-native';

interface PostImportOnboardingStepProps {
  onFinish: () => void;
  isCompleting: boolean;
}

export function PostImportOnboardingStep({
  onFinish,
  isCompleting,
}: PostImportOnboardingStepProps) {
  return (
    <Box flex={1}>
      <Stack flex={1} align="center" justify="center" gap="xl" paddingHorizontal="lg">
        <Stack gap="md" align="center">
          <AppText variant="title" style={styles.centeredText}>
            Your workplace is ready
          </AppText>
          <AppText variant="body" color="secondary" style={styles.centeredText}>
            You can continue setting things up whenever you need to.
          </AppText>
        </Stack>
        <Box width="100%">
          <AppButton variant="primary" size="lg" onPress={onFinish} loading={isCompleting}>
            Continue to the app
          </AppButton>
        </Box>
      </Stack>
    </Box>
  );
}

const styles = StyleSheet.create({ centeredText: { textAlign: 'center' } });
