import type { IconName } from '@/src/types/domainIcons';
import { AppConfig } from '@/src/constants';
import { useOnboardingSession } from '@/src/contexts/app-shell/AppOnboardingProvider';
import { analytics } from '@/src/services/analytics';
import { triggerHaptic } from '@/src/utils/haptics';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useState } from 'react';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from '@/src/constants/defaults';
import { onboardingService } from '../services/OnboardingService';
import { generator } from '@/src/data/database/idGenerator';
import { WorkplaceId } from '@/src/types/ids';
import { preferences } from '@/src/utils/preferences';
import { useLocalSearchParams } from 'expo-router';

export interface OnboardingFlowViewModel {
  step: number;
  name: string;
  setName: (value: string) => void;
  workplaceName: string;
  setWorkplaceName: (value: string) => void;
  workplaceIcon: IconName;
  setWorkplaceIcon: (value: IconName) => void;
  selectedCurrency: string;
  setSelectedCurrency: (value: string) => void;
  selectedAccounts: string[];
  customAccounts: { name: string; type: 'INCOME' | 'EXPENSE'; icon: IconName }[];
  onToggleAccount: (name: string) => void;
  onAddCustomAccount: (name: string, type: 'INCOME' | 'EXPENSE', icon: IconName) => void;
  selectedCategories: string[];
  customCategories: { name: string; type: 'INCOME' | 'EXPENSE'; icon: IconName }[];
  onToggleCategory: (name: string) => void;
  onAddCustomCategory: (name: string, type: 'INCOME' | 'EXPENSE', icon: IconName) => void;
  isCompleting: boolean;
  onContinue: () => void;
  onRestore: () => void;
  onBack: () => void;
  onFinish: () => void;
}

export function useOnboardingFlow(): OnboardingFlowViewModel {
  const { mode, stage: routeStage } = useLocalSearchParams<{ mode?: string; stage?: string }>();
  const isFullSetup = mode === 'full';
  const deviceOnboardingRequired = !preferences.device.deviceRegistered;
  const isPostImport =
    routeStage === 'post_import' || preferences.device.onboardingStage === 'post_import';
  const { completeDeviceOnboarding, persistDisplayName } = useOnboardingSession();
  const [step, setStep] = useState(
    isPostImport ? 7 : isFullSetup ? 2 : deviceOnboardingRequired ? 1 : 3,
  );
  const [name, setName] = useState(preferences.userName ?? '');
  const [workplaceName, setWorkplaceName] = useState(
    isFullSetup ? '' : `${preferences.userName?.trim() || 'User'}'s Personal workplace`,
  );
  const [workplaceIcon, setWorkplaceIcon] = useState<IconName>('briefcase');
  const [selectedCurrency, setSelectedCurrency] = useState<string>(AppConfig.defaultCurrency);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>(['Cash', 'Bank']);
  const [customAccounts, setCustomAccounts] = useState<
    { name: string; type: 'INCOME' | 'EXPENSE'; icon: IconName }[]
  >([]);
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
  const [operationId] = useState<WorkplaceId>(() => generator() as WorkplaceId);

  const onContinue = useCallback(async () => {
    void triggerHaptic('medium');
    analytics.trackOnboardingStep(String(step), true);
    analytics.trackFeatureUsage('onboarding', 'step_continue', { current_step: step });
    if (step === 1) {
      persistDisplayName(name);
      try {
        await completeDeviceOnboarding(name);
      } catch (error) {
        logger.error('[Onboarding] Failed to claim Device', error);
        void triggerHaptic('error');
        return;
      }
      setWorkplaceName(`${name.trim() || 'User'}'s Personal workplace`);
      setWorkplaceIcon('briefcase');
      setStep(3);
      return;
    }
    setStep((prev: number) => prev + 1);
  }, [completeDeviceOnboarding, name, persistDisplayName, step]);

  const onBack = useCallback(() => {
    void triggerHaptic('light');
    if (isFullSetup && step === 2) {
      AppNavigation.back();
      return;
    }
    if (!isFullSetup && step === 3) {
      setStep(1);
      return;
    }
    setStep((prev: number) => prev - 1);
  }, [isFullSetup, step]);

  const onToggleAccount = useCallback((accountName: string) => {
    setSelectedAccounts(prev => {
      const isSelected = prev.includes(accountName);
      void triggerHaptic(isSelected ? 'light' : 'medium');
      return isSelected ? prev.filter(a => a !== accountName) : [...prev, accountName];
    });
  }, []);

  const onAddCustomAccount = useCallback(
    (accountName: string, type: 'INCOME' | 'EXPENSE', icon: IconName) => {
      setSelectedAccounts(prev => {
        if (prev.includes(accountName)) return prev;
        return [...prev, accountName];
      });
      setCustomAccounts(prev => {
        if (
          prev.some(a => a.name.toLowerCase() === accountName.toLowerCase()) ||
          DEFAULT_ACCOUNTS.some(
            a =>
              a.name.toLowerCase() === accountName.toLowerCase() ||
              a.id.toLowerCase() === accountName.toLowerCase(),
          )
        )
          return prev;
        return [...prev, { name: accountName, type, icon }];
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
          prev.some(c => c.name.toLowerCase() === categoryName.toLowerCase()) ||
          DEFAULT_CATEGORIES.some(
            c =>
              c.name.toLowerCase() === categoryName.toLowerCase() ||
              c.id.toLowerCase() === categoryName.toLowerCase(),
          )
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
      if (isPostImport) {
        const workplaceId = preferences.device.onboardingWorkplaceId;
        if (!workplaceId) throw new Error('Imported Workplace is missing');
        onboardingService.completeImportedWorkplace(workplaceId);
        void triggerHaptic('success');
        AppNavigation.toDashboard();
        return;
      }
      // Perform DB operations
      await onboardingService.completeOnboarding({
        operationId,
        name,
        workplaceName,
        workplaceIcon,
        selectedCurrency,
        selectedAccounts,
        customAccounts,
        selectedCategories,
        customCategories,
      });

      // Then update UI state & preferences via Context
      if (!isFullSetup) await completeDeviceOnboarding(name);

      analytics.trackFeatureUsage('onboarding', 'completed', {
        accounts_count: selectedAccounts.length + customAccounts.length,
        categories_count: selectedCategories.length + customCategories.length,
        currency: selectedCurrency,
      });

      logger.info('Onboarding complete; app state will route to dashboard');
      void triggerHaptic('success');

      // Navigate the user to the dashboard
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
    workplaceName,
    workplaceIcon,
    selectedAccounts,
    selectedCategories,
    selectedCurrency,
    operationId,
    completeDeviceOnboarding,
    isFullSetup,
    isPostImport,
  ]);

  return {
    step,
    name,
    setName,
    workplaceName,
    setWorkplaceName,
    workplaceIcon,
    setWorkplaceIcon,
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
    onRestore: () => {
      persistDisplayName(name);
      AppNavigation.toImportSelection(isFullSetup, 'onboarding');
    },
    onBack,
    onFinish,
  };
}
