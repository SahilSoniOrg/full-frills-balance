import type { IconName } from '@/src/types/domainIcons';
import { AppConfig, FontIds, ThemeIds, type FontId, type ThemeId } from '@/src/constants';
import { useOnboardingSession } from '@/src/contexts/app-shell/AppOnboardingProvider';
import { analytics } from '@/src/services/analytics';
import { triggerHaptic } from '@/src/utils/haptics';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from '@/src/constants/defaults';
import { onboardingService } from '../services/OnboardingService';
import { generator } from '@/src/data/database/idGenerator';
import type { WorkplaceId } from '@/src/types/ids';
import { preferences } from '@/src/utils/preferences';
import { useLocalSearchParams } from 'expo-router';
import {
  clearOnboardingDraft,
  loadOnboardingDraft,
  ONBOARDING_DRAFT_VERSION,
  saveOnboardingDraft,
  type OnboardingCustomAccount,
  type OnboardingCustomCategory,
  type OnboardingDraft,
  type OnboardingStage,
  type OnboardingWorkplaceStep,
} from '../services/OnboardingDraftStore';
import {
  transitionOnboardingNavigation,
  type OnboardingEditTarget,
  type OnboardingNavigationState,
} from '../domain/onboardingFlowNavigation';
import {
  readImportedWorkplaceSummary,
  type ImportedWorkplaceSummary,
} from '../domain/readImportedWorkplaceSummary';

export interface OnboardingFlowViewModel {
  /** Named flow state. `post_import` is normalized to `appearance` on hydration. */
  stage: OnboardingStage;
  /** Legacy numeric projection retained for the existing progress layout. */
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
  customAccounts: OnboardingCustomAccount[];
  onToggleAccount: (name: string) => void;
  onAddCustomAccount: (name: string, type: 'ASSET' | 'LIABILITY', icon: IconName) => void;
  selectedCategories: string[];
  customCategories: OnboardingCustomCategory[];
  onToggleCategory: (name: string) => void;
  onAddCustomCategory: (name: string, type: 'INCOME' | 'EXPENSE', icon: IconName) => void;
  themeId: ThemeId;
  setThemeId: (value: ThemeId) => void;
  fontId: FontId;
  setFontId: (value: FontId) => void;
  isCompleting: boolean;
  onContinue: () => void;
  onRestore: () => void;
  onBack: () => void;
  onEdit: (target: OnboardingEditTarget) => void;
  onFinish: () => void;
  importedSummary: ImportedWorkplaceSummary | null;
  isImportedWorkplace: boolean;
}

function legacyStep(stage: OnboardingStage, workplaceStep: OnboardingWorkplaceStep): number {
  if (stage === 'user_profile') return 1;
  if (stage === 'workplace_setup') {
    return { identity: 2, currency: 3, accounts: 4, categories: 5 }[workplaceStep];
  }
  if (stage === 'appearance') return 7;
  if (stage === 'review') return 8;
  return 9;
}

function defaultWorkplaceName(name: string): string {
  return `${name.trim() || 'User'}'s Personal workplace`;
}

export function useOnboardingFlow(): OnboardingFlowViewModel {
  const { mode, stage: routeStage } = useLocalSearchParams<{ mode?: string; stage?: string }>();
  const isFullSetup = mode === 'full';
  const deviceOnboardingRequired = !preferences.device.deviceRegistered;
  const [initialDraft] = useState<OnboardingDraft | undefined>(() => loadOnboardingDraft());
  const [isPostImport] = useState(() => {
    return (
      routeStage === 'post_import' ||
      preferences.device.onboardingStage === 'post_import' ||
      Boolean(initialDraft?.importedWorkplaceId)
    );
  });
  const [importedWorkplaceId] = useState<WorkplaceId | undefined>(
    () => initialDraft?.importedWorkplaceId || preferences.device.onboardingWorkplaceId,
  );
  const initialStage: OnboardingStage = isPostImport
    ? 'appearance'
    : initialDraft?.stage && initialDraft.stage !== 'post_import'
      ? initialDraft.stage
      : isFullSetup
        ? 'workplace_setup'
        : deviceOnboardingRequired
          ? 'user_profile'
          : 'workplace_setup';
  const initialWorkplaceStep: OnboardingWorkplaceStep =
    initialDraft?.workplaceStep || (isFullSetup ? 'identity' : 'currency');

  const { completeDeviceOnboarding, persistDisplayName } = useOnboardingSession();
  const [stage, setStage] = useState<OnboardingStage>(initialStage);
  const [workplaceStep, setWorkplaceStep] = useState<OnboardingWorkplaceStep>(initialWorkplaceStep);
  const [returnToReview, setReturnToReview] = useState(initialDraft?.returnToReview ?? false);
  const [name, setName] = useState(
    initialDraft?.name?.trim() ? initialDraft.name : (preferences.userName ?? ''),
  );
  const [workplaceName, setWorkplaceName] = useState(
    initialDraft?.workplaceName ??
      (isFullSetup ? '' : defaultWorkplaceName(preferences.userName ?? '')),
  );
  const [workplaceIcon, setWorkplaceIcon] = useState<IconName>(
    initialDraft?.workplaceIcon ?? 'briefcase',
  );
  const [selectedCurrency, setSelectedCurrency] = useState<string>(
    initialDraft?.selectedCurrency ?? AppConfig.defaultCurrency,
  );
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>(
    initialDraft?.selectedAccounts ?? ['Cash', 'Bank'],
  );
  const [customAccounts, setCustomAccounts] = useState<OnboardingCustomAccount[]>(
    initialDraft?.customAccounts ?? [],
  );
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    initialDraft?.selectedCategories ?? ['Salary', 'Food & Drink', 'Groceries', 'Bills'],
  );
  const [customCategories, setCustomCategories] = useState<OnboardingCustomCategory[]>(
    initialDraft?.customCategories ?? [],
  );
  const [themeId, setThemeId] = useState<ThemeId>(
    preferences.themePrefs?.themeId ?? initialDraft?.themeId ?? ThemeIds.DEEP_SPACE,
  );
  const [fontId, setFontId] = useState<FontId>(
    preferences.themePrefs?.fontId ?? initialDraft?.fontId ?? FontIds.DEEP_SPACE,
  );
  const [isCompleting, setIsCompleting] = useState(false);
  const [importedSummary, setImportedSummary] = useState<ImportedWorkplaceSummary | null>(null);
  const [operationId] = useState<WorkplaceId>(
    () => initialDraft?.operationId ?? (generator() as WorkplaceId),
  );
  const updateThemeId = useCallback((value: ThemeId) => {
    setThemeId(value);
    preferences.themePrefs?.setThemeId?.(value);
  }, []);
  const updateFontId = useCallback((value: FontId) => {
    setFontId(value);
    preferences.themePrefs?.setFontId?.(value);
  }, []);
  const navigationState: OnboardingNavigationState = { stage, workplaceStep, returnToReview };

  useEffect(() => {
    if (!isPostImport || !importedWorkplaceId) return;
    let cancelled = false;
    void readImportedWorkplaceSummary(importedWorkplaceId)
      .then(summary => {
        if (!cancelled) setImportedSummary(summary);
      })
      .catch(error => logger.warn('[Onboarding] Failed to read imported summary', { error }));
    return () => {
      cancelled = true;
    };
  }, [importedWorkplaceId, isPostImport]);

  const applyNavigationState = useCallback((next: OnboardingNavigationState) => {
    setStage(next.stage);
    setWorkplaceStep(next.workplaceStep);
    setReturnToReview(next.returnToReview);
  }, []);

  // MMKV is synchronous, so the flow can hydrate before the first screen is rendered.
  // Checkpoint writes include the whole draft, making interruption resumable without
  // coupling the draft to a User or Workplace preference bag.
  useEffect(() => {
    if (stage === 'complete') {
      clearOnboardingDraft();
      return;
    }

    const draft: OnboardingDraft = {
      version: ONBOARDING_DRAFT_VERSION,
      stage,
      workplaceStep,
      operationId,
      name,
      workplaceName,
      workplaceIcon,
      selectedCurrency,
      selectedAccounts,
      customAccounts,
      selectedCategories,
      customCategories,
      ...(returnToReview ? { returnToReview: true } : {}),
      ...(importedWorkplaceId ? { importedWorkplaceId } : {}),
    };

    try {
      saveOnboardingDraft(draft);
      // A full Workplace creation is a separate flow for an already claimed
      // Device; do not make an interrupted settings flow look like launch-time
      // Device onboarding. New/import onboarding does own this stage pointer.
      if (!isFullSetup || isPostImport || !preferences.device.onboardingCompleted) {
        // Keep the legacy import marker in the Device bag until the imported
        // Workplace is explicitly acknowledged. Device recovery relies on it
        // to avoid claiming an install merely because imported books exist.
        preferences.device.setOnboardingStage?.(isPostImport ? 'post_import' : stage);
      }
    } catch (error) {
      logger.warn('[Onboarding] Failed to persist draft checkpoint', { error });
    }
  }, [
    customAccounts,
    customCategories,
    importedWorkplaceId,
    isFullSetup,
    isPostImport,
    name,
    operationId,
    selectedAccounts,
    selectedCategories,
    selectedCurrency,
    stage,
    workplaceIcon,
    workplaceName,
    workplaceStep,
    returnToReview,
  ]);

  const completeImportedWorkplace = useCallback(async () => {
    if (!importedWorkplaceId) throw new Error('Imported Workplace is missing');
    await onboardingService.completeImportedWorkplace(
      importedWorkplaceId,
      workplaceName,
      workplaceIcon,
    );
    setStage('complete');
    void triggerHaptic('success');
    AppNavigation.toDashboard();
  }, [importedWorkplaceId, workplaceIcon, workplaceName]);

  const onContinue = useCallback(async () => {
    void triggerHaptic('medium');
    const step = legacyStep(stage, workplaceStep);
    analytics.trackOnboardingStep(String(step), true);
    analytics.trackFeatureUsage('onboarding', 'step_continue', { current_step: step });

    const transition = transitionOnboardingNavigation(
      navigationState,
      { type: 'continue' },
      { isFullSetup, isPostImport },
    );
    if (transition.command === 'claim-device') {
      persistDisplayName(name);
      try {
        await completeDeviceOnboarding(name);
      } catch (error) {
        logger.error('[Onboarding] Failed to claim Device', error);
        void triggerHaptic('error');
        return;
      }
      if (stage === 'user_profile' && !workplaceName.trim()) {
        setWorkplaceName(defaultWorkplaceName(name));
        setWorkplaceIcon('briefcase');
      }
    }
    if (stage === 'user_profile') persistDisplayName(name);
    applyNavigationState(transition.state);
  }, [
    applyNavigationState,
    completeDeviceOnboarding,
    isFullSetup,
    isPostImport,
    name,
    navigationState,
    persistDisplayName,
    stage,
    workplaceName,
  ]);

  const onBack = useCallback(() => {
    void triggerHaptic('light');
    const transition = transitionOnboardingNavigation(
      navigationState,
      { type: 'back' },
      { isFullSetup, isPostImport },
    );
    if (transition.command === 'navigate-back') {
      AppNavigation.back();
      return;
    }
    applyNavigationState(transition.state);
  }, [applyNavigationState, isFullSetup, isPostImport, navigationState]);

  const onFinish = useCallback(async () => {
    if (isCompleting || stage !== 'review') return;
    setIsCompleting(true);
    try {
      if (isPostImport) {
        await completeImportedWorkplace();
        return;
      }

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
      setStage('complete');
      analytics.trackFeatureUsage('onboarding', 'completed', {
        accounts_count: selectedAccounts.length + customAccounts.length,
        categories_count: selectedCategories.length + customCategories.length,
        currency: selectedCurrency,
      });
      logger.info('Onboarding complete; app state will route to dashboard');
      void triggerHaptic('success');
      AppNavigation.toDashboard();
    } catch (error) {
      logger.error('Failed to complete onboarding:', error);
      void triggerHaptic('error');
    } finally {
      setIsCompleting(false);
    }
  }, [
    completeImportedWorkplace,
    customAccounts,
    customCategories,
    isCompleting,
    isPostImport,
    name,
    operationId,
    selectedAccounts,
    selectedCategories,
    selectedCurrency,
    stage,
    workplaceIcon,
    workplaceName,
  ]);

  const onEdit = useCallback(
    (target: OnboardingEditTarget) => {
      const transition = transitionOnboardingNavigation(
        navigationState,
        { type: 'edit', target },
        { isFullSetup, isPostImport },
      );
      applyNavigationState(transition.state);
    },
    [applyNavigationState, isFullSetup, isPostImport, navigationState],
  );

  const onToggleAccount = useCallback((accountName: string) => {
    setSelectedAccounts(prev => {
      const isSelected = prev.includes(accountName);
      void triggerHaptic(isSelected ? 'light' : 'medium');
      return isSelected ? prev.filter(a => a !== accountName) : [...prev, accountName];
    });
  }, []);

  const onAddCustomAccount = useCallback(
    (accountName: string, type: 'ASSET' | 'LIABILITY', icon: IconName) => {
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

  return {
    stage,
    step: legacyStep(stage, workplaceStep),
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
    themeId,
    setThemeId: updateThemeId,
    fontId,
    setFontId: updateFontId,
    isCompleting,
    onContinue,
    onRestore: () => {
      persistDisplayName(name);
      AppNavigation.toImportSelection(isFullSetup, 'onboarding');
    },
    onBack,
    onEdit,
    onFinish,
    importedSummary,
    isImportedWorkplace: Boolean(importedWorkplaceId),
  };
}
