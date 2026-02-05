import { Screen } from '@/src/components/layout';
import { Spacing } from '@/src/constants';
import { useUI } from '@/src/contexts/UIContext';
import { AccountType } from '@/src/data/models/Account';
import { useAccountActions } from '@/src/features/accounts/hooks/useAccounts';
import { logger } from '@/src/utils/logger';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { StepAccountSuggestions } from '../components/StepAccountSuggestions';
import { StepCategorySuggestions } from '../components/StepCategorySuggestions';
import { StepCurrency } from '../components/StepCurrency';
import { StepFinalize } from '../components/StepFinalize';
import { StepSplash } from '../components/StepSplash';

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

export default function OnboardingScreen() {
    const [step, setStep] = useState(1);
    const [name, setName] = useState('');
    const [selectedCurrency, setSelectedCurrency] = useState('USD');
    const [selectedAccounts, setSelectedAccounts] = useState<string[]>(['Cash', 'Bank']);
    const [customAccounts, setCustomAccounts] = useState<{ name: string; icon: string }[]>([]);
    const [selectedCategories, setSelectedCategories] = useState<string[]>(['Salary', 'Food & Drink', 'Groceries', 'Bills']);
    const [customCategories, setCustomCategories] = useState<{ name: string; type: 'INCOME' | 'EXPENSE'; icon: string }[]>([]);
    const [isCompleting, setIsCompleting] = useState(false);
    const { completeOnboarding } = useUI();
    const { createAccount } = useAccountActions();

    const handleContinue = () => setStep(prev => prev + 1);
    const handleBack = () => setStep(prev => prev - 1);

    const toggleAccount = (name: string) => {
        setSelectedAccounts(prev =>
            prev.includes(name) ? prev.filter(a => a !== name) : [...prev, name]
        );
    };

    const addCustomAccount = (name: string, icon: string) => {
        if (!selectedAccounts.includes(name)) {
            setSelectedAccounts(prev => [...prev, name]);
        }
        if (!customAccounts.some(a => a.name === name) && !DEFAULT_ACCOUNTS.some(a => a.name === name)) {
            setCustomAccounts(prev => [...prev, { name, icon }]);
        }
    };

    const toggleCategory = (name: string) => {
        setSelectedCategories(prev =>
            prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]
        );
    };

    const addCustomCategory = (name: string, type: 'INCOME' | 'EXPENSE', icon: string) => {
        if (!selectedCategories.includes(name)) {
            setSelectedCategories(prev => [...prev, name]);
        }
        if (!customCategories.some(c => c.name === name) && !DEFAULT_CATEGORIES.some(c => c.name === name)) {
            setCustomCategories(prev => [...prev, { name, type, icon }]);
        }
    };

    const handleFinish = async () => {
        if (isCompleting) return;
        setIsCompleting(true);
        try {
            logger.info(`Starting onboarding completion for user: ${name}`);

            // 1. Complete basic onboarding (prefs)
            await completeOnboarding(name.trim(), selectedCurrency);

            // 2. Create Default Equity Accounts (Hidden from selection but essential)
            const equityAccounts = [
                { name: 'Opening Balance Equity', icon: 'scale', type: AccountType.EQUITY },
                { name: 'Balance Corrections', icon: 'construct', type: AccountType.EQUITY },
            ];

            for (const acc of equityAccounts) {
                await createAccount({
                    name: acc.name,
                    accountType: acc.type,
                    currencyCode: selectedCurrency,
                    initialBalance: 0,
                    icon: acc.icon,
                });
            }

            // 3. Create selected accounts (defaults + custom)
            for (const accountName of selectedAccounts) {
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

            // 4. Create selected categories (defaults + custom)
            for (const categoryName of selectedCategories) {
                // Skip if already created in accounts step (though unlikely with naming conventions)
                if (selectedAccounts.includes(categoryName)) continue;

                let type = AccountType.EXPENSE;
                let icon = 'tag';
                const def = DEFAULT_CATEGORIES.find(c => c.name === categoryName);
                const custom = customCategories.find(c => c.name === categoryName);

                if (def) {
                    type = def.type as any as AccountType;
                    icon = def.icon;
                } else if (custom) {
                    type = custom.type as any as AccountType;
                    icon = custom.icon;
                }

                await createAccount({
                    name: categoryName,
                    accountType: type as any as AccountType,
                    currencyCode: selectedCurrency,
                    initialBalance: 0,
                    icon,
                });
            }

            logger.info('Onboarding complete, redirecting to accounts');
            router.replace('/(tabs)/accounts' as any);
        } catch (error) {
            logger.error('Failed to complete onboarding:', error);
        } finally {
            setIsCompleting(false);
        }
    };

    const renderStep = () => {
        switch (step) {
            case 1:
                return (
                    <StepSplash
                        name={name}
                        setName={setName}
                        onContinue={handleContinue}
                        isCompleting={isCompleting}
                    />
                );
            case 2:
                return (
                    <StepCurrency
                        selectedCurrency={selectedCurrency}
                        onSelect={setSelectedCurrency}
                        onContinue={handleContinue}
                        onBack={handleBack}
                        isCompleting={isCompleting}
                    />
                );
            case 3:
                return (
                    <StepAccountSuggestions
                        selectedAccounts={selectedAccounts}
                        customAccounts={customAccounts}
                        onToggleAccount={toggleAccount}
                        onAddCustomAccount={addCustomAccount}
                        onContinue={handleContinue}
                        onBack={handleBack}
                        isCompleting={isCompleting}
                    />
                );
            case 4:
                return (
                    <StepCategorySuggestions
                        selectedCategories={selectedCategories}
                        customCategories={customCategories}
                        onToggleCategory={toggleCategory}
                        onAddCustomCategory={addCustomCategory}
                        onContinue={handleContinue}
                        onBack={handleBack}
                        isCompleting={isCompleting}
                    />
                );
            case 5:
                return (
                    <StepFinalize
                        onFinish={handleFinish}
                        isCompleting={isCompleting}
                    />
                );
            default:
                return null;
        }
    };

    return (
        <Screen showBack={false}>
            <View style={styles.content}>
                {renderStep()}
            </View>
        </Screen>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        padding: Spacing.lg,
    },
    content: {
        maxWidth: 400,
        width: '100%',
        alignSelf: 'center',
        flex: 1,
        justifyContent: 'center',
    },
});
