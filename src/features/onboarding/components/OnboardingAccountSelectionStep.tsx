import { CategoryCreationBar } from '@/src/components/common/CategoryCreationBar';
import { SelectableGrid, SelectableItem } from '@/src/components/common/SelectableGrid';
import { IconName } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import React from 'react';
import { DEFAULT_ACCOUNTS } from '../constants';

interface OnboardingAccountSelectionStepProps {
  selectedAccounts: string[];
  customAccounts: { name: string; icon: IconName }[];
  onToggleAccount: (name: string) => void;
  onAddCustomAccount: (name: string, type: 'INCOME' | 'EXPENSE', icon: IconName) => void;
  onContinue: () => void;
  onBack: () => void;
  isCompleting: boolean;
}

export function OnboardingAccountSelectionStep({
  selectedAccounts,
  customAccounts,
  onToggleAccount,
  onAddCustomAccount,
  onContinue,
  onBack,
  isCompleting,
}: OnboardingAccountSelectionStepProps) {
  const items: SelectableItem[] = [
    ...DEFAULT_ACCOUNTS.map(account => ({
      id: account.name, // Use name as ID to match state
      name: account.name,
      icon: account.icon,
    })),
    ...customAccounts.map(account => ({
      id: account.name, // Custom accounts still use name as ID for now
      name: account.name,
      icon: account.icon,
    })),
  ];

  const handleToggle = (id: string) => {
    const item = items.find(candidate => candidate.id === id);
    if (item) {
      onToggleAccount(item.name);
    }
  };

  return (
    <SelectableGrid
      title={AppConfig.strings.onboarding.accounts.title}
      subtitle={AppConfig.strings.onboarding.accounts.subtitle}
      items={items}
      selectedIds={selectedAccounts}
      onToggle={handleToggle}
      onContinue={onContinue}
      onBack={onBack}
      isCompleting={isCompleting}
      disableAnimation={true}
      bottomContent={
        <CategoryCreationBar
          placeholder={AppConfig.strings.onboarding.accounts.placeholder}
          onAdd={onAddCustomAccount}
          defaultIcon="wallet"
        />
      }
    />
  );
}
