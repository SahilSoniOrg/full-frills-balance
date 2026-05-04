import { IconName } from '@/src/components/core/AppIcon';
import { useUI } from '@/src/contexts/UIContext';
import { triggerHaptic } from '@/src/utils/haptics';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { storage } from '@/src/utils/storage';
import { useCallback, useEffect, useState } from 'react';
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
  onAddCustomAccount: (name: string, type: 'INCOME' | 'EXPENSE', icon: IconName) => void;
  selectedCategories: string[];
  customCategories: { name: string; type: 'INCOME' | 'EXPENSE'; icon: IconName }[];
  onToggleCategory: (name: string) => void;
  onAddCustomCategory: (name: string, type: 'INCOME' | 'EXPENSE', icon: IconName) => void;
  isCompleting: boolean;
  onContinue: () => void;
  onBack: () => void;
  onFinish: () => void;
}

const ONBOARDING_DRAFT_KEY = 'onboarding_draft_v1';

export function useOnboardingFlow(): OnboardingFlowViewModel {
  const ui = useUI();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState(ui.defaultCurrency);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>(['Cash', 'Bank']);
  const [customAccounts, setCustomAccounts] = useState<{ name: string; icon: IconName }[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([
    'Salary',
    'Food & Drink',
    'Groceries',
    'Bills',
  ]);
  const [customCategories, setCustomCategories] = useState<
    { name: string; type: 'INCOME' | 'EXPENSE'; icon: IconName }[]
  >([]);
  const [isCompleting, setIsCompleting] = useState(false);

  // 1. Rehydrate on mount
  useEffect(() => {
    try {
      const draft = storage.getString(ONBOARDING_DRAFT_KEY);
      if (draft) {
        const data = JSON.parse(draft);
        if (data.step) setStep(data.step);
        if (data.name) setName(data.name);
        if (data.selectedCurrency) setSelectedCurrency(data.selectedCurrency);
        if (data.selectedAccounts) setSelectedAccounts(data.selectedAccounts);
        if (data.customAccounts) setCustomAccounts(data.customAccounts);
        if (data.selectedCategories) setSelectedCategories(data.selectedCategories);
        if (data.customCategories) setCustomCategories(data.customCategories);
        logger.info('[Onboarding] Rehydrated draft from disk');
      }
    } catch (error) {
      logger.error('[Onboarding] Failed to rehydrate draft', error);
    }
  }, []);

  // 2. Sync on change
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const data = {
          step,
          name,
          selectedCurrency,
          selectedAccounts,
          customAccounts,
          selectedCategories,
          customCategories,
        };
        storage.set(ONBOARDING_DRAFT_KEY, JSON.stringify(data));
      } catch (error) {
        logger.error('[Onboarding] Failed to sync draft to disk', error);
      }
    }, 500); // Small debounce

    return () => clearTimeout(timer);
  }, [
    step,
    name,
    selectedCurrency,
    selectedAccounts,
    customAccounts,
    selectedCategories,
    customCategories,
  ]);

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

  const onAddCustomAccount = useCallback(
    (accountName: string, _type: 'INCOME' | 'EXPENSE', icon: IconName) => {
      setSelectedAccounts(prev => {
        if (prev.includes(accountName)) return prev;
        return [...prev, accountName];
      });
      setCustomAccounts(prev => {
        if (
          prev.some(a => a.name === accountName) ||
          DEFAULT_ACCOUNTS.some(a => a.name === accountName)
        )
          return prev;
        return [...prev, { name: accountName, icon }];
      });
      void triggerHaptic('medium');
    },
    [],
  );

  const onToggleCategory = useCallback((categoryName: string) => {
    setSelectedCategories(prev => {
      const isSelected = prev.includes(categoryName);
      void triggerHaptic(isSelected ? 'light' : 'medium');
      return isSelected ? prev.filter(c => c !== categoryName) : [...prev, categoryName];
    });
  }, []);

  const onAddCustomCategory = useCallback(
    (categoryName: string, type: 'INCOME' | 'EXPENSE', icon: IconName) => {
      setSelectedCategories(prev => {
        if (prev.includes(categoryName)) return prev;
        return [...prev, categoryName];
      });
      setCustomCategories(prev => {
        if (
          prev.some(c => c.name === categoryName) ||
          DEFAULT_CATEGORIES.some(c => c.name === categoryName)
        )
          return prev;
        return [...prev, { name: categoryName, type, icon }];
      });
      void triggerHaptic('medium');
    },
    [],
  );

  const onFinish = useCallback(async () => {
    if (isCompleting) return;
    setIsCompleting(true);
    try {
      // Perform DB operations
      await onboardingService.completeOnboarding({
        name,
        selectedCurrency,
        selectedAccounts,
        customAccounts,
        selectedCategories,
        customCategories,
      });

      // Then update UI state & preferences via Context
      await ui.completeOnboarding(name, selectedCurrency, 'balance-glancer');

      // Clear draft
      storage.remove(ONBOARDING_DRAFT_KEY);

      logger.info('Onboarding complete, redirecting to dashboard');
      void triggerHaptic('success');
      AppNavigation.toDashboard();
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
    selectedCurrency,
    ui,
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
