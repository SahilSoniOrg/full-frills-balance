import { SelectableGrid, SelectableItem } from '@/src/components/common/SelectableGrid';
import { AppIcon, AppText } from '@/src/components/core';
import { IconName } from '@/src/components/core/AppIcon';
import { useTheme } from '@/src/hooks/use-theme';
import React, { useCallback, useMemo } from 'react';
import { DEFAULT_CATEGORIES } from '../constants';

interface StepCategorySuggestionsProps {
    selectedCategories: string[];
    customCategories: { name: string; type: 'INCOME' | 'EXPENSE'; icon: IconName }[];
    onToggleCategory: (name: string) => void;
    onAddCustomCategory: (name: string, type: 'INCOME' | 'EXPENSE', icon: IconName) => void;
    onContinue: () => void;
    onBack: () => void;
    isCompleting: boolean;
}

export const StepCategorySuggestions: React.FC<StepCategorySuggestionsProps> = ({
    selectedCategories,
    customCategories,
    onToggleCategory,
    onAddCustomCategory,
    onContinue,
    onBack,
    isCompleting,
}) => {
    const { theme } = useTheme();

    const items: SelectableItem[] = useMemo(() => {
        return [
            ...DEFAULT_CATEGORIES.map(cat => ({
                ...cat,
                id: cat.name,
                subtitle: cat.type === 'INCOME' ? 'Income' : 'Expense',
            })),
            ...customCategories.map(cat => ({
                id: cat.name,
                name: cat.name,
                icon: cat.icon,
                subtitle: cat.type === 'INCOME' ? 'Income' : 'Expense',
            })),
        ];
    }, [customCategories]);

    const handleToggle = useCallback((id: string) => {
        if (!DEFAULT_CATEGORIES.some(c => c.name === id) && !customCategories.some(c => c.name === id)) {
        }
        onToggleCategory(id);
    }, [customCategories, onToggleCategory]);

    const renderIcon = useCallback((item: SelectableItem, isSelected: boolean) => {
        const catType = item.subtitle === 'Income' ? 'INCOME' : 'EXPENSE';
        const behaviorColor = catType === 'INCOME' ? theme.success : theme.error;
        return (
            <AppIcon
                name={item.icon as IconName}
                size={20}
                color={isSelected ? behaviorColor : theme.textSecondary}
            />
        );
    }, [theme]);

    const renderSubtitle = useCallback((item: SelectableItem, isSelected: boolean) => {
        const catType = item.subtitle === 'Income' ? 'INCOME' : 'EXPENSE';
        const behaviorColor = catType === 'INCOME' ? theme.success : theme.error;
        return (
            <AppText
                variant="caption"
                style={{ color: isSelected ? behaviorColor : theme.textSecondary }}
            >
                {item.subtitle}
            </AppText>
        );
    }, [theme]);

    return (
        <SelectableGrid
            title="Setup Categories"
            subtitle="Select categories you use often."
            items={items}
            selectedIds={selectedCategories}
            onToggle={handleToggle}
            onContinue={onContinue}
            onBack={onBack}
            isCompleting={isCompleting}
            customInput={{
                placeholder: 'Add category...',
                onAdd: onAddCustomCategory,
                defaultIcon: 'tag',
                showTypeToggle: true,
                typeLabels: { income: 'Income', expense: 'Expense' },
            }}
            renderIcon={renderIcon}
            renderSubtitle={renderSubtitle}
        />
    );
};
