import { openAppearancePicker } from '@/src/components/overlays/appearancePickerSession';
import { WorkplaceBasicInfoStep } from '@/src/features/setup/components/workplace-setup/WorkplaceBasicInfoStep';
import { IconName } from '@/src/components/core';

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
  return (
    <WorkplaceBasicInfoStep
      title="Name your workplace"
      subtitle="Choose a name and icon for this workplace, such as personal spending or household bills."
      name={name}
      onNameChange={onNameChange}
      onGenerateName={onGenerateName}
      icon={icon}
      onIconPress={() => {
        void (async () => {
          const result = await openAppearancePicker({ mode: 'icon', selectedIcon: icon });
          if (result) onIconChange(result.icon);
        })();
      }}
      onContinue={onContinue}
      onCancel={onBack}
      cancelLabel="Back"
      continueLabel="Continue"
      isCreating={isCompleting}
    />
  );
}
