import { useUI } from '@/src/contexts/UIContext';
import { AccountType } from '@/src/data/models/Account';
import { useAccountActions } from '@/src/features/accounts/hooks/useAccounts';
import { logger } from '@/src/utils/logger';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';

const DEFAULT_ACCOUNTS = [
    { name: 'Cash', icon: 'wallet', type: AccountType.ASSET },
    { name: 'Bank', icon: 'bank', type: AccountType.ASSET },
    { name: 'Savings', icon: 'safe', type: AccountType.ASSET },
    { name: 'Revolut', icon: 'creditCard', type: AccountType.ASSET },
];

const DEFAULT_CATEGORIES = [
    { name: 'Salary', icon: 'trendingUp', type: AccountType.INCOME },
    { name: 'Work', icon: 'briefcase', type: AccountType.INCOME },
    { name: 'Food & Drink', icon: 'coffee', type: AccountType.EXPENSE },
    { name: 'Groceries', icon: 'shoppingCart', type: AccountType.EXPENSE },
    { name: 'Transportation', icon: 'bus', type: AccountType.EXPENSE },
    { name: 'Entertainment', icon: 'film', type: AccountType.EXPENSE },
    { name: 'Shopping', icon: 'shoppingBag', type: AccountType.EXPENSE },
    { name: 'Bills', icon: 'fileText', type: AccountType.EXPENSE },
];

export interface OnboardingFlowViewModel {
    step: number;
    name: string;
    setName: (value: string) => void;
    selectedCurrency: string;
    setSelectedCurrency: (value: string) => void;
    selectedAccounts: string[];
    customAccounts: { name: string; icon: string }[];
    onToggleAccount: (name: string) => void;
    onAddCustomAccount: (name: string, icon: string) => void;
    selectedCategories: string[];
    customCategories: { name: string; type: 'INCOME' | 'EXPENSE'; icon: string }[];
    onToggleCategory: (name: string) => void;
    onAddCustomCategory: (name: string, type: 'INCOME' | 'EXPENSE', icon: string) => void;
    isCompleting: boolean;
    onContinue: () => void;
    onBack: () => void;
    onFinish: () => void;
}

export function useOnboardingFlow(): OnboardingFlowViewModel {
    const [step, setStep] = useState(1);
    const [name, setName] = useState('');
    const [selectedCurrency, setSelectedCurrency] = useState('USD');
    const [selectedAccounts, setSelectedAccounts] = useState<string[]>(['Cash', 'Bank']);
    const [customAccounts, setCustomAccounts] = useState<{ name: string; icon: string }[]>([]);
    const [selectedCategories, setSelectedCategories] = useState<string[]>(['Salary', 'Food & Drink', 'Groceries', 'Bills']);
    const [customCategories, setCustomCategories] = useState<{ name: string; type: 'INCOME' | 'EXPENSE'; icon: string }[]>([]);
    const [isCompleting, setIsCompleting] = useState(false);
    const { completeOnboarding } = useUI();
    const { createAccount, findAccountByName } = useAccountActions();

    const onContinue = useCallback(() => setStep(prev => prev + 1), []);
    const onBack = useCallback(() => setStep(prev => prev - 1), []);

    const onToggleAccount = useCallback((accountName: string) => {
        setSelectedAccounts(prev =>
            prev.includes(accountName) ? prev.filter(a => a !== accountName) : [...prev, accountName]
        );
    }, []);

    const onAddCustomAccount = useCallback((accountName: string, icon: string) => {
        if (!selectedAccounts.includes(accountName)) {
            setSelectedAccounts(prev => [...prev, accountName]);
        }
        if (!customAccounts.some(a => a.name === accountName) && !DEFAULT_ACCOUNTS.some(a => a.name === accountName)) {
            setCustomAccounts(prev => [...prev, { name: accountName, icon }]);
        }
    }, [customAccounts, selectedAccounts]);

    const onToggleCategory = useCallback((categoryName: string) => {
        setSelectedCategories(prev =>
            prev.includes(categoryName) ? prev.filter(c => c !== categoryName) : [...prev, categoryName]
        );
    }, []);

    const onAddCustomCategory = useCallback((categoryName: string, type: 'INCOME' | 'EXPENSE', icon: string) => {
        if (!selectedCategories.includes(categoryName)) {
            setSelectedCategories(prev => [...prev, categoryName]);
        }
        if (!customCategories.some(c => c.name === categoryName) && !DEFAULT_CATEGORIES.some(c => c.name === categoryName)) {
            setCustomCategories(prev => [...prev, { name: categoryName, type, icon }]);
        }
    }, [customCategories, selectedCategories]);

    const onFinish = useCallback(async () => {
        if (isCompleting) return;
        setIsCompleting(true);
        try {
            logger.info(`Starting onboarding completion for user: ${name}`);

            await completeOnboarding(name.trim(), selectedCurrency);

            const equityAccounts = [
                {
                    name: `Opening Balances (${selectedCurrency})`,
                    legacyNames: ['Opening Balance Equity'],
                    icon: 'scale',
                    type: AccountType.EQUITY
                },
                {
                    name: `Balance Corrections (${selectedCurrency})`,
                    legacyNames: ['Balance Corrections', 'Balance Correction'],
                    icon: 'construct',
                    type: AccountType.EQUITY
                },
            ];

            for (const acc of equityAccounts) {
                const existing = await findAccountByName(acc.name);
                if (existing) continue;

                let legacyMatch = false;
                for (const legacyName of acc.legacyNames) {
                    const legacy = await findAccountByName(legacyName);
                    if (legacy && legacy.currencyCode === selectedCurrency) {
                        legacyMatch = true;
                        break;
                    }
                }

                if (legacyMatch) continue;

                await createAccount({
                    name: acc.name,
                    accountType: acc.type,
                    currencyCode: selectedCurrency,
                    initialBalance: 0,
                    icon: acc.icon,
                });
            }

            for (const accountName of selectedAccounts) {
                const existing = await findAccountByName(accountName);
                if (existing) continue;

                let type = AccountType.ASSET;
                let icon = 'wallet';
                const def = DEFAULT_ACCOUNTS.find(a => a.name === accountName);
                const custom = customAccounts.find(a => a.name === accountName);

                if (def) {
                    type = def.type;
                    icon = def.icon;
                } else if (custom) {
                    icon = custom.icon;
                }

                await createAccount({
                    name: accountName,
                    accountType: type,
                    currencyCode: selectedCurrency,
                    initialBalance: 0,
                    icon,
                });
            }

            for (const categoryName of selectedCategories) {
                if (selectedAccounts.includes(categoryName)) continue;

                const existing = await findAccountByName(categoryName);
                if (existing) continue;

                let type = AccountType.EXPENSE;
                let icon = 'tag';
                const def = DEFAULT_CATEGORIES.find(c => c.name === categoryName);
                const custom = customCategories.find(c => c.name === categoryName);

                if (def) {
                    type = def.type as AccountType;
                    icon = def.icon;
                } else if (custom) {
                    type = custom.type as AccountType;
                    icon = custom.icon;
                }

                await createAccount({
                    name: categoryName,
                    accountType: type,
                    currencyCode: selectedCurrency,
                    initialBalance: 0,
                    icon,
                });
            }

            logger.info('Onboarding complete, redirecting to accounts');
            router.replace('/(tabs)/accounts');
        } catch (error) {
            logger.error('Failed to complete onboarding:', error);
        } finally {
            setIsCompleting(false);
        }
    }, [
        completeOnboarding,
        createAccount,
        customAccounts,
        customCategories,
        isCompleting,
        name,
        selectedAccounts,
        selectedCategories,
        selectedCurrency
    ]);

    return {
        step,
        name,
        setName,
        selectedCurrency,
        setSelectedCurrency,
        selectedAccounts,
        customAccounts,
        onToggleAccount,
        onAddCustomAccount,
        selectedCategories,
        customCategories,
        onToggleCategory,
        onAddCustomCategory,
        isCompleting,
        onContinue,
        onBack,
        onFinish,
    };
}
