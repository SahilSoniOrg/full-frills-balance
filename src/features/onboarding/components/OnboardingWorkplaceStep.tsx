import { IconPickerModal } from '@/src/components/common/IconPickerModal';
import { WorkplaceBasicInfoStep } from '@/src/components/common/workplace-setup/WorkplaceBasicInfoStep';
import { AppButton, AppText, IconName } from '@/src/components/core';
import { AppConfig, Spacing } from '@/src/constants';
import { useImport } from '@/src/hooks/use-import';
import { Stack } from '@/src/design-system';
import { useState } from 'react';

interface OnboardingWorkplaceStepProps {
  name: string;
  icon: IconName;
  onNameChange: (name: string) => void;
  onIconChange: (icon: IconName) => void;
  onContinue: () => void;
  onBack: () => void;
  onRestore: () => void;
  isCompleting: boolean;
}

export function OnboardingWorkplaceStep({
  name,
  icon,
  onNameChange,
  onIconChange,
  onContinue,
  onBack,
  onRestore,
  isCompleting,
}: OnboardingWorkplaceStepProps) {
  const { isImporting } = useImport();
  const [iconPickerVisible, setIconPickerVisible] = useState(false);
  return (
    <>
      <WorkplaceBasicInfoStep
        title="Create your workplace"
        subtitle="Choose a name and icon for your personal workplace."
        name={name}
        onNameChange={onNameChange}
        icon={icon}
        onIconPress={() => setIconPickerVisible(true)}
        onContinue={onContinue}
        onCancel={onBack}
        cancelLabel="Back"
        continueLabel="Continue"
        isCreating={isCompleting || isImporting}
        belowContent={
          <Stack gap="xs" align="center" style={{ marginTop: Spacing.xl }}>
            <AppText variant="caption" color="secondary">
              {AppConfig.strings.onboarding.splash.restorePrompt}
            </AppText>
            <AppButton
              variant="ghost"
              size="md"
              onPress={onRestore}
              loading={isImporting}
              disabled={isImporting || isCompleting}
              accessibilityLabel={AppConfig.strings.onboarding.splash.btnRestore}
              testID="onboarding-restore-button"
            >
              {AppConfig.strings.onboarding.splash.btnRestore}
            </AppButton>
          </Stack>
        }
      />
      <IconPickerModal
        visible={iconPickerVisible}
        onClose={() => setIconPickerVisible(false)}
        onSelect={onIconChange}
        selectedIcon={icon}
      />
    </>
  );
}
