import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from '@/src/constants/defaults';
import { AppConfig, FontIds, ThemeIds } from '@/src/constants';
import { WorkplaceAccountSelectionStep } from '@/src/components/common/workplace-setup/WorkplaceAccountSelectionStep';
import { WorkplaceCategorySelectionStep } from '@/src/components/common/workplace-setup/WorkplaceCategorySelectionStep';
import { WorkplaceCurrencyStep } from '@/src/components/common/workplace-setup/WorkplaceCurrencyStep';
import { WorkplaceSetupLayout } from '@/src/components/common/workplace-setup/WorkplaceSetupLayout';
import {
  StepSplash,
  OnboardingWorkplaceStepComponent,
  OnboardingThemeStep,
  OnboardingReviewStep,
} from '@/src/features/onboarding';
import { AppNavigation } from '@/src/utils/navigation';
import { generator } from '@/src/data/database/idGenerator';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { createSetupCoordinator } from './SetupCoordinator';
import { loadSetupDraft } from './SetupDraftStore';
import { finishSetup } from './setupFinishers';
import type { SetupSliceId, StarterAccountInput, StarterCategoryInput } from './setupTypes';

function defaultsFor(
  names: string[],
  suggestions: readonly { name: string; type: any; icon: any }[],
) {
  return names.map(name => suggestions.find(item => item.name === name)).filter(Boolean) as any[];
}

function SetupScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const journeyId = mode === 'full' ? 'create_workplace' : 'first_run';
  const operationId = useMemo(() => generator() as any, []);
  const existingDraft = useMemo(() => {
    const draft = loadSetupDraft();
    return draft?.journeyId === journeyId ? draft : undefined;
  }, [journeyId]);
  const coordinator = useMemo(
    () =>
      createSetupCoordinator({
        journeyId,
        operationId,
        draft: existingDraft,
        finishers: {
          firstRun: async draft => {
            const workplaceId = await finishSetup(draft);
            return { kind: 'workplace_created', workplaceId: workplaceId as any };
          },
          workplaceCreation: async draft => {
            const workplaceId = await finishSetup(draft);
            return { kind: 'workplace_created', workplaceId: workplaceId as any };
          },
        },
      }),
    [existingDraft, journeyId, operationId],
  );

  const [slice, setSlice] = useState<SetupSliceId>(() => {
    const action = coordinator.next();
    return action.kind === 'present'
      ? action.sliceId
      : journeyId === 'first_run'
        ? 'device'
        : 'workplace';
  });
  const [name, setName] = useState(
    existingDraft && 'device' in existingDraft
      ? (existingDraft.device?.displayName.value ?? '')
      : '',
  );
  const [workplaceName, setWorkplaceName] = useState(existingDraft?.workplace?.name.value ?? '');
  const [workplaceIcon, setWorkplaceIcon] = useState<any>(
    existingDraft?.workplace?.icon.value ?? 'briefcase',
  );
  const [currency, setCurrency] = useState<string>(
    existingDraft?.workplace?.baseCurrency.value ?? AppConfig.defaultCurrency,
  );
  const [accounts, setAccounts] = useState<string[]>(['Cash', 'Bank']);
  const [categories, setCategories] = useState<string[]>([
    'Salary',
    'Food & Drink',
    'Groceries',
    'Bills',
  ]);
  const [themeId, setThemeId] = useState<any>(
    existingDraft && 'appearance' in existingDraft
      ? (existingDraft.appearance?.themeId.value ?? ThemeIds.DEEP_SPACE)
      : ThemeIds.DEEP_SPACE,
  );
  const [fontId, setFontId] = useState<any>(
    existingDraft && 'appearance' in existingDraft
      ? (existingDraft.appearance?.fontId.value ?? FontIds.DEEP_SPACE)
      : FontIds.DEEP_SPACE,
  );
  const [busy, setBusy] = useState(false);
  const [workplaceStep, setWorkplaceStep] = useState<
    'identity' | 'currency' | 'accounts' | 'categories'
  >('identity');

  const advance = async (
    nextSlice: SetupSliceId,
    output: Parameters<typeof coordinator.accept>[1],
  ) => {
    setBusy(true);
    try {
      await coordinator.accept(slice as any, output as any);
      setSlice(nextSlice);
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    try {
      await coordinator.accept('summary', { confirmed: true });
      const outcome = await coordinator.finish();
      if (outcome.kind === 'workplace_created') AppNavigation.toDashboard();
    } finally {
      setBusy(false);
    }
  };

  const workplaceOutput = {
    name: {
      value: workplaceName.trim() || `${name.trim() || 'User'}'s Personal workplace`,
      source: 'user_entered' as const,
    },
    icon: { value: workplaceIcon, source: 'user_entered' as const },
    baseCurrency: { value: currency, source: 'user_entered' as const },
    selectedAccounts: defaultsFor(accounts, DEFAULT_ACCOUNTS) as StarterAccountInput[],
    selectedCategories: defaultsFor(categories, DEFAULT_CATEGORIES) as StarterCategoryInput[],
    acceptedCheckpoints: ['identity', 'currency', 'accounts', 'categories'] as const,
  };

  const render = () => {
    switch (slice) {
      case 'device':
        return (
          <StepSplash
            name={name}
            setName={setName}
            onContinue={() =>
              advance('workplace', { displayName: { value: name, source: 'user_entered' } })
            }
            onRestore={() => AppNavigation.toImportSelection(false, 'onboarding')}
            isCompleting={busy}
          />
        );
      case 'workplace':
        return (
          <WorkplaceSetupLayout currentStep={2} totalSteps={journeyId === 'first_run' ? 6 : 5}>
            {workplaceStep === 'identity' && (
              <OnboardingWorkplaceStepComponent
                name={workplaceName || `${name.trim() || 'User'}'s Personal workplace`}
                icon={workplaceIcon}
                onNameChange={setWorkplaceName}
                onIconChange={setWorkplaceIcon}
                onContinue={() => setWorkplaceStep('currency')}
                onBack={() => setSlice('device')}
                isCompleting={busy}
              />
            )}
            {workplaceStep === 'currency' && (
              <WorkplaceCurrencyStep
                selectedCurrency={currency}
                onSelectCurrency={setCurrency}
                onContinue={() => setWorkplaceStep('accounts')}
                onBack={() => setWorkplaceStep('identity')}
                isCompleting={busy}
              />
            )}
            {workplaceStep === 'accounts' && (
              <WorkplaceAccountSelectionStep
                selectedAccounts={accounts}
                customAccounts={[]}
                onToggleAccount={n =>
                  setAccounts(v => (v.includes(n) ? v.filter(x => x !== n) : [...v, n]))
                }
                onAddCustomAccount={() => undefined}
                onContinue={() => setWorkplaceStep('categories')}
                onBack={() => setWorkplaceStep('currency')}
                isCompleting={busy}
              />
            )}
            {workplaceStep === 'categories' && (
              <WorkplaceCategorySelectionStep
                selectedCategories={categories}
                customCategories={[]}
                onToggleCategory={n =>
                  setCategories(v => (v.includes(n) ? v.filter(x => x !== n) : [...v, n]))
                }
                onAddCustomCategory={() => undefined}
                onContinue={() =>
                  advance(journeyId === 'first_run' ? 'appearance' : 'summary', workplaceOutput)
                }
                onBack={() => setWorkplaceStep('accounts')}
                isCompleting={busy}
              />
            )}
          </WorkplaceSetupLayout>
        );
      case 'appearance':
        return (
          <OnboardingThemeStep
            currencyCode={currency}
            themeId={themeId}
            fontId={fontId}
            onThemeChange={setThemeId}
            onFontChange={setFontId}
            onContinue={() =>
              advance('summary', {
                themeId: { value: themeId, source: 'user_entered' },
                fontId: { value: fontId, source: 'user_entered' },
              })
            }
            onBack={() => setSlice('workplace')}
            isCompleting={busy}
          />
        );
      case 'summary':
        return (
          <OnboardingReviewStep
            name={name}
            workplaceName={workplaceOutput.name.value}
            workplaceIcon={workplaceIcon}
            selectedCurrency={currency}
            accountCount={accounts.length}
            categoryCount={categories.length}
            themeId={themeId}
            fontId={fontId}
            onChangeWorkplace={() => setSlice('workplace')}
            onChangeProfile={() => setSlice('device')}
            onChangeCurrency={() => setSlice('workplace')}
            onChangeAccounts={() => setSlice('workplace')}
            onChangeCategories={() => setSlice('workplace')}
            onChangeAppearance={() => setSlice('appearance')}
            onConfirm={finish}
            onBack={() => setSlice('appearance')}
            isCompleting={busy}
            isImportedWorkplace={false}
            showAppearance
          />
        );
      default:
        return null;
    }
  };

  return (
    <View testID="setup-screen" style={{ flex: 1 }}>
      {render()}
    </View>
  );
}

export default withPrivacyScope(SetupScreen);
