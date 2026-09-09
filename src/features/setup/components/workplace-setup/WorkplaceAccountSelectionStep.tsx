import { CategoryCreationBar } from '@/src/features/setup/components/CategoryCreationBar';
import { SelectableGrid, SelectableItem } from '@/src/features/setup/components/SelectableGrid';
import { Icon, AppText, IconName } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { DEFAULT_ACCOUNTS } from '@/src/constants/defaults';
import { useTheme } from '@/src/hooks/use-theme';
import { useState } from 'react';

interface WorkplaceAccountSelectionStepProps {
  selectedAccounts: string[];
  customAccounts: {
    name: string;
    type: 'ASSET' | 'LIABILITY';
    icon: IconName;
  }[];
  onToggleAccount: (name: string) => void;
  onAddCustomAccount: (name: string, type: 'ASSET' | 'LIABILITY', icon: IconName) => void;
  onContinue: () => void;
  onBack: () => void;
  isCompleting: boolean;
}

export function WorkplaceAccountSelectionStep({
  selectedAccounts,
  customAccounts,
  onToggleAccount,
  onAddCustomAccount,
  onContinue,
  onBack,
  isCompleting,
}: WorkplaceAccountSelectionStepProps) {
  const { theme } = useTheme();
  const [showValidation, setShowValidation] = useState(false);
  const accountTypeLabels = AppConfig.strings.onboarding.accounts.typeLabels;
  const items: SelectableItem[] = [
    ...DEFAULT_ACCOUNTS.map(account => ({
      id: account.name, // Use name as ID to match state
      name: account.name,
      icon: account.icon,
      subtitle:
        account.type === 'LIABILITY' ? accountTypeLabels.liability : accountTypeLabels.asset,
    })),
    ...customAccounts.map(account => ({
      id: account.name, // Custom accounts still use name as ID for now
      name: account.name,
      icon: account.icon,
      subtitle:
        account.type === 'LIABILITY' ? accountTypeLabels.liability : accountTypeLabels.asset,
    })),
  ];

  const handleToggle = (id: string) => {
    const item = items.find(candidate => candidate.id === id);
    if (item) {
      onToggleAccount(item.name);
      setShowValidation(false);
    }
  };

  const handleContinue = () => {
    if (selectedAccounts.length === 0) {
      setShowValidation(true);
      return;
    }
    onContinue();
  };

  return (
    <SelectableGrid
      title={AppConfig.strings.onboarding.accounts.title}
      subtitle={AppConfig.strings.onboarding.accounts.subtitle}
      items={items}
      selectedIds={selectedAccounts}
      onToggle={handleToggle}
      onContinue={handleContinue}
      onBack={onBack}
      isCompleting={isCompleting}
      disableAnimation={true}
      validationMessage={showValidation ? 'Select at least one account to continue.' : undefined}
      renderSubtitle={item => (
        <AppText
          variant="caption"
          style={{
            color: item.subtitle === accountTypeLabels.liability ? theme.liability : theme.asset,
          }}
        >
          {item.subtitle}
        </AppText>
      )}
      listFooterContent={
        <CategoryCreationBar
          placeholder={AppConfig.strings.onboarding.accounts.placeholder}
          onAdd={(name, type, icon) => {
            if (type === 'ASSET' || type === 'LIABILITY') {
              onAddCustomAccount(name, type, icon);
              setShowValidation(false);
            }
          }}
          defaultIcon={Icon.Wallet}
          showTypeToggle
          defaultType="ASSET"
          typeOptions={[
            { type: 'ASSET', label: accountTypeLabels.asset, color: theme.asset },
            {
              type: 'LIABILITY',
              label: accountTypeLabels.liability,
              color: theme.liability,
            },
          ]}
        />
      }
    />
  );
}
