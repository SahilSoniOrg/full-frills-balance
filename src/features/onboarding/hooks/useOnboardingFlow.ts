import { IconName } from '@/src/components/core/AppIcon';
import { useUI } from '@/src/contexts/UIContext';
import { triggerHaptic } from '@/src/utils/haptics';
import { logger } from '@/src/utils/logger';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from '../constants';
import { onboardingService } from '../services/OnboardingService';

export interface OnboardingFlowViewModel {
    step: number;
    name: string;
    setName: (value: string) => void;
    selectedCurrency: string;
    setSelectedCurrency: (value: string) => void;
    selectedAccounts: string[];
    customAccounts: { name: string; icon: IconName }[];
    onToggleAccount: (name: string) => void;
    onAddCustomAccount: (name: string, icon: IconName) => void;
    selectedCategories: string[];
    customCategories: { name: string; type: 'INCOME' | 'EXPENSE'; icon: IconName }[];
    onToggleCategory: (name: string) => void;
    onAddCustomCategory: (name: string, type: 'INCOME' | 'EXPENSE', icon: IconName) => void;
    isCompleting: boolean;
    onContinue: () => void;
    onBack: () => void;
    onFinish: () => void;
}

export function useOnboardingFlow(): OnboardingFlowViewModel {
    const ui = useUI();
    const [step, setStep] = useState(1);
    const [name, setName] = useState('');
    const [selectedCurrency, setSelectedCurrency] = useState('USD');
    const [selectedAccounts, setSelectedAccounts] = useState<string[]>(['Cash', 'Bank']);
    const [customAccounts, setCustomAccounts] = useState<{ name: string; icon: IconName }[]>([]);
    const [selectedCategories, setSelectedCategories] = useState<string[]>(['Salary', 'Food & Drink', 'Groceries', 'Bills']);
    const [customCategories, setCustomCategories] = useState<{ name: string; type: 'INCOME' | 'EXPENSE'; icon: IconName }[]>([]);
    const [isCompleting, setIsCompleting] = useState(false);

    const onContinue = useCallback(() => {
        void triggerHaptic('medium');
        setStep(prev => prev + 1);
    }, []);

    const onBack = useCallback(() => {
        void triggerHaptic('light');
        setStep(prev => prev - 1);
    }, []);

    const onToggleAccount = useCallback((accountName: string) => {
        setSelectedAccounts(prev => {
            const isSelected = prev.includes(accountName);
            void triggerHaptic(isSelected ? 'light' : 'medium');
            return isSelected ? prev.filter(a => a !== accountName) : [...prev, accountName];
        });
    }, []);

    const onAddCustomAccount = useCallback((accountName: string, icon: IconName) => {
        if (!selectedAccounts.includes(accountName)) {
            setSelectedAccounts(prev => [...prev, accountName]);
        }
        if (!customAccounts.some(a => a.name === accountName) && !DEFAULT_ACCOUNTS.some(a => a.name === accountName)) {
            setCustomAccounts(prev => [...prev, { name: accountName, icon }]);
            void triggerHaptic('medium');
        }
    }, [customAccounts, selectedAccounts]);

    const onToggleCategory = useCallback((categoryName: string) => {
        setSelectedCategories(prev => {
            const isSelected = prev.includes(categoryName);
            void triggerHaptic(isSelected ? 'light' : 'medium');
            return isSelected ? prev.filter(c => c !== categoryName) : [...prev, categoryName];
        });
    }, []);

    const onAddCustomCategory = useCallback((categoryName: string, type: 'INCOME' | 'EXPENSE', icon: IconName) => {
        if (!selectedCategories.includes(categoryName)) {
            setSelectedCategories(prev => [...prev, categoryName]);
        }
        if (!customCategories.some(c => c.name === categoryName) && !DEFAULT_CATEGORIES.some(c => c.name === categoryName)) {
            setCustomCategories(prev => [...prev, { name: categoryName, type, icon }]);
            void triggerHaptic('medium');
        }
    }, [customCategories, selectedCategories]);

    const onFinish = useCallback(async () => {
        if (isCompleting) return;
        setIsCompleting(true);
        try {
            // First perform DB operations
            await onboardingService.completeOnboarding({
                name,
                selectedCurrency,
                selectedAccounts,
                customAccounts,
                selectedCategories,
                customCategories
            });

            // Then update UI state & preferences via Context
            await ui.completeOnboarding(name, selectedCurrency);

            logger.info('Onboarding complete, redirecting to dashboard');
            void triggerHaptic('success');
            router.replace('/(tabs)');
        } catch (error) {
            logger.error('Failed to complete onboarding:', error);
            void triggerHaptic('error');
        } finally {
            setIsCompleting(false);
        }
    }, [
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
