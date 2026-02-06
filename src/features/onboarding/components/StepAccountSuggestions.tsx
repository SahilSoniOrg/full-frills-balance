import { SelectableGrid, SelectableItem } from '@/src/components/common/SelectableGrid';
import { AppText } from '@/src/components/core';
import { IconName } from '@/src/components/core/AppIcon';
import { useTheme } from '@/src/hooks/use-theme';
import React, { useMemo } from 'react';
import { DEFAULT_ACCOUNTS } from '../constants';

interface StepAccountSuggestionsProps {
    selectedAccounts: string[];
    customAccounts: { name: string; icon: IconName }[];
    onToggleAccount: (name: string) => void;
    onAddCustomAccount: (name: string, type: 'INCOME' | 'EXPENSE', icon: IconName) => void;
    onContinue: () => void;
    onBack: () => void;
    isCompleting: boolean;
}

export const StepAccountSuggestions: React.FC<StepAccountSuggestionsProps> = ({
    selectedAccounts,
    customAccounts,
    onToggleAccount,
    onAddCustomAccount,
    onContinue,
    onBack,
    isCompleting,
}) => {
    const { theme } = useTheme();

    const items: SelectableItem[] = useMemo(() => {
        return [
            ...DEFAULT_ACCOUNTS,
            ...customAccounts.map(acc => ({ id: acc.name, name: acc.name, icon: acc.icon })),
        ];
    }, [customAccounts]);

    const handleToggle = (id: string) => {
        const account = items.find(a => (a.id ?? a.name) === id);
        if (account && !selectedAccounts.includes(id)) {
            if (!DEFAULT_ACCOUNTS.some(a => a.name === id) && !customAccounts.some(c => c.name === id)) {
                onAddCustomAccount(id, 'EXPENSE', account.icon || 'wallet');
            }
        }
        onToggleAccount(id);
    };

    return (
        <SelectableGrid
            title="Setup Accounts"
            subtitle="Where is your money? Select all that apply."
            items={items}
            selectedIds={selectedAccounts}
            onToggle={handleToggle}
            onContinue={onContinue}
            onBack={onBack}
            isCompleting={isCompleting}
            customInput={{
                placeholder: 'Add custom account...',
                onAdd: onAddCustomAccount,
                defaultIcon: 'wallet',
            }}
        />
    );
};
