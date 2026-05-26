import { AppButton, AppIcon, AppInput, AppText, IconName } from '@/src/components/core';
import { Box, Stack } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { Keyboard, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';

interface WorkplaceBasicInfoStepProps {
  title: string;
  subtitle: string;
  name: string;
  onNameChange: (name: string) => void;
  icon?: IconName;
  onIconPress?: () => void;
  onContinue: () => void;
  onCancel?: () => void;
  continueLabel?: string;
  cancelLabel?: string;
  isCreating?: boolean;
}

export function WorkplaceBasicInfoStep({
  title,
  subtitle,
  name,
  onNameChange,
  icon,
  onIconPress,
  onContinue,
  onCancel,
  continueLabel = 'Continue',
  cancelLabel = 'Cancel',
  isCreating = false,
}: WorkplaceBasicInfoStepProps) {
  const { theme } = useTheme();

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
              {title}
            </AppText>
            <AppText variant="body" color="secondary" style={{ textAlign: 'center' }}>
              {subtitle}
            </AppText>
          </Stack>

          <Stack gap="xl" paddingHorizontal="md">
            {onIconPress && icon && (
              <Stack align="center" gap="md">
                <TouchableOpacity
                  onPress={onIconPress}
                  style={[
                    styles.iconContainer,
                    { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
                  ]}
                >
                  <AppIcon name={icon} size={48} color={theme.primary} />
                  <Box
                    position="absolute"
                    bottom={-4}
                    right={-4}
                    background="primary"
                    borderRadius="full"
                    padding="xs"
                  >
                    <AppIcon name="edit" size={14} color={theme.surface} />
                  </Box>
                </TouchableOpacity>
              </Stack>
            )}

            <AppInput
              label="Name"
              placeholder="e.g. My Workplace"
              value={name}
              onChangeText={onNameChange}
              autoFocus
              onSubmitEditing={() => {
                Keyboard.dismiss();
                onContinue();
              }}
            />
          </Stack>

          <Box paddingBottom="lg" paddingHorizontal="md">
            <AppButton
              variant="primary"
              size="lg"
              onPress={() => {
                Keyboard.dismiss();
                onContinue();
              }}
              disabled={!name.trim() || isCreating}
              loading={isCreating}
            >
              {continueLabel}
            </AppButton>
            {onCancel && (
              <AppButton
                variant="ghost"
                size="md"
                onPress={onCancel}
                style={{ marginTop: 8 }}
                disabled={isCreating}
              >
                {cancelLabel}
              </AppButton>
            )}
          </Box>
        </Stack>
      </ScrollView>
    </Box>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
});
