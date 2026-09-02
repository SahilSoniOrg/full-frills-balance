import { IconPickerModal } from '@/src/components/common/IconPickerModal';
import { WorkplaceBasicInfoStep } from '@/src/components/common/workplace-setup/WorkplaceBasicInfoStep';
import { IconName } from '@/src/components/core';
import { useState } from 'react';

interface WorkplaceIdentityStepProps {
  name: string;
  icon: IconName;
  onNameChange: (name: string) => void;
  onGenerateName?: () => void;
  onIconChange: (icon: IconName) => void;
  onContinue: () => void;
  onBack: () => void;
  isCompleting: boolean;
}

export function WorkplaceIdentityStep({
  name,
  icon,
  onNameChange,
  onGenerateName,
  onIconChange,
  onContinue,
  onBack,
  isCompleting,
}: WorkplaceIdentityStepProps) {
  const [iconPickerVisible, setIconPickerVisible] = useState(false);
  return (
    <>
      <WorkplaceBasicInfoStep
        title="Create your workplace"
        subtitle="Choose a name and icon for your personal workplace."
        name={name}
        onNameChange={onNameChange}
        onGenerateName={onGenerateName}
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
