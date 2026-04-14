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
    ...DEFAULT_ACCOUNTS,
    ...customAccounts.map(account => ({
      id: account.name,
      name: account.name,
      icon: account.icon,
    })),
  ];

  const handleToggle = (id: string) => {
    const account = items.find(candidate => (candidate.id ?? candidate.name) === id);
    if (account && !selectedAccounts.includes(id)) {
      if (
        !DEFAULT_ACCOUNTS.some(candidate => candidate.name === id) &&
        !customAccounts.some(candidate => candidate.name === id)
      ) {
        onAddCustomAccount(id, 'EXPENSE', account.icon || 'wallet');
      }
    }
    onToggleAccount(id);
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
