import { IconPickerModal } from '@/src/components/common/IconPickerModal';
import { WorkplaceBasicInfoStep } from '@/src/components/common/workplace-setup/WorkplaceBasicInfoStep';
import { IconName } from '@/src/components/core';
import { useState } from 'react';

interface OnboardingWorkplaceStepProps {
  name: string;
  icon: IconName;
  onNameChange: (name: string) => void;
  onIconChange: (icon: IconName) => void;
  onContinue: () => void;
  onBack: () => void;
  isCompleting: boolean;
}

export function OnboardingWorkplaceStep({
  name,
  icon,
  onNameChange,
  onIconChange,
  onContinue,
  onBack,
  isCompleting,
}: OnboardingWorkplaceStepProps) {
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
        isCreating={isCompleting}
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
