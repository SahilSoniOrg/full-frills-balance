import { SelectableGrid, SelectableItem } from '@/src/components/common/SelectableGrid';
import { AppIcon, AppText, IconName } from '@/src/components/core';
import { AppConfig, Opacity, Size, withOpacity } from '@/src/constants';
import { useCurrencies } from '@/src/hooks/use-currencies';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from '../constants';

type BaseProps = {
    onContinue: () => void;
    onBack: () => void;
    isCompleting: boolean;
};

type CurrencyStepProps = BaseProps & {
    kind: 'currency';
    selectedCurrency: string;
    onSelectCurrency: (code: string) => void;
};

type AccountStepProps = BaseProps & {
    kind: 'accounts';
    selectedAccounts: string[];
    customAccounts: { name: string; icon: IconName }[];
    onToggleAccount: (name: string) => void;
    onAddCustomAccount: (name: string, type: 'INCOME' | 'EXPENSE', icon: IconName) => void;
};

type CategoryStepProps = BaseProps & {
    kind: 'categories';
    selectedCategories: string[];
    customCategories: { name: string; type: 'INCOME' | 'EXPENSE'; icon: IconName }[];
    onToggleCategory: (name: string) => void;
    onAddCustomCategory: (name: string, type: 'INCOME' | 'EXPENSE', icon: IconName) => void;
};

type OnboardingSelectableStepProps = CurrencyStepProps | AccountStepProps | CategoryStepProps;

export function OnboardingSelectableStep(props: OnboardingSelectableStepProps) {
    const { theme } = useTheme();
    const { currencies } = useCurrencies();
    const incomeLabel = AppConfig.strings.onboarding.categories.typeLabels.income;
    const expenseLabel = AppConfig.strings.onboarding.categories.typeLabels.expense;

    const renderCategoryIcon = (item: SelectableItem, isSelected: boolean) => {
        const categoryType = item.subtitle === incomeLabel ? 'INCOME' : 'EXPENSE';
        const behaviorColor = categoryType === 'INCOME' ? theme.success : theme.error;
        return (
            <AppIcon
                name={item.icon as IconName}
                size={Size.iconSm}
                color={isSelected ? behaviorColor : theme.textSecondary}
            />
        );
    };

    const renderCategorySubtitle = (item: SelectableItem, isSelected: boolean) => {
        const categoryType = item.subtitle === incomeLabel ? 'INCOME' : 'EXPENSE';
        const behaviorColor = categoryType === 'INCOME' ? theme.success : theme.error;
        return (
            <AppText
                variant="caption"
                style={{ color: isSelected ? behaviorColor : theme.textSecondary }}
            >
                {item.subtitle}
            </AppText>
        );
    };

    if (props.kind === 'currency') {
        const uniqueCurrencies = Array.from(
            new Map(currencies.map((c) => [c.code, c])).values()
        );

        const items: SelectableItem[] = uniqueCurrencies.map((currency) => ({
            id: currency.code,
            name: currency.code,
            symbol: currency.symbol,
            subtitle: currency.name,
        }));

        return (
            <SelectableGrid
                title={AppConfig.strings.onboarding.currency.title}
                subtitle={AppConfig.strings.onboarding.currency.subtitle}
                items={items}
                selectedIds={[props.selectedCurrency]}
                onToggle={props.onSelectCurrency}
                onContinue={props.onContinue}
                onBack={props.onBack}
                isCompleting={props.isCompleting}
                showSearch
                searchPlaceholder={AppConfig.strings.onboarding.currency.searchPlaceholder}
                renderSubtitle={(item, isSelected) => (
                    <AppText
                        variant="caption"
                        color="secondary"
                        style={{ color: isSelected ? withOpacity(theme.primary, Opacity.heavy) : theme.textSecondary }}
                    >
                        {item.subtitle}
                    </AppText>
                )}
            />
        );
    }

    if (props.kind === 'accounts') {
        const items: SelectableItem[] = [
            ...DEFAULT_ACCOUNTS,
            ...props.customAccounts.map((account) => ({ id: account.name, name: account.name, icon: account.icon })),
        ];

        const handleToggle = (id: string) => {
            const account = items.find((candidate) => (candidate.id ?? candidate.name) === id);
            if (account && !props.selectedAccounts.includes(id)) {
                if (!DEFAULT_ACCOUNTS.some((candidate) => candidate.name === id) && !props.customAccounts.some((candidate) => candidate.name === id)) {
                    props.onAddCustomAccount(id, 'EXPENSE', account.icon || 'wallet');
                }
            }
            props.onToggleAccount(id);
        };

        return (
            <SelectableGrid
                title={AppConfig.strings.onboarding.accounts.title}
                subtitle={AppConfig.strings.onboarding.accounts.subtitle}
                items={items}
                selectedIds={props.selectedAccounts}
                onToggle={handleToggle}
                onContinue={props.onContinue}
                onBack={props.onBack}
                isCompleting={props.isCompleting}
                customInput={{
                    placeholder: AppConfig.strings.onboarding.accounts.placeholder,
                    onAdd: props.onAddCustomAccount,
                    defaultIcon: 'wallet',
                }}
            />
        );
    }

    const categoryItems: SelectableItem[] = [
        ...DEFAULT_CATEGORIES.map((category) => ({
            ...category,
            id: category.name,
            subtitle: category.type === 'INCOME' ? incomeLabel : expenseLabel,
        })),
        ...props.customCategories.map((category) => ({
            id: category.name,
            name: category.name,
            icon: category.icon,
            subtitle: category.type === 'INCOME' ? incomeLabel : expenseLabel,
        })),
    ];

    return (
        <SelectableGrid
            title={AppConfig.strings.onboarding.categories.title}
            subtitle={AppConfig.strings.onboarding.categories.subtitle}
            items={categoryItems}
            selectedIds={props.selectedCategories}
            onToggle={props.onToggleCategory}
            onContinue={props.onContinue}
            onBack={props.onBack}
            isCompleting={props.isCompleting}
            customInput={{
                placeholder: AppConfig.strings.onboarding.categories.placeholder,
                onAdd: props.onAddCustomCategory,
                defaultIcon: 'tag',
                showTypeToggle: true,
                typeLabels: AppConfig.strings.onboarding.categories.typeLabels,
            }}
            renderIcon={renderCategoryIcon}
            renderSubtitle={renderCategorySubtitle}
        />
    );
}
