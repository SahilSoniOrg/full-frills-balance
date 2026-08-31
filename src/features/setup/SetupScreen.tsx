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
import { finishDeviceSetup, finishSetup } from './setupFinishers';
import type {
  SetupSliceId,
  SetupSliceOutput,
  StarterAccountInput,
  StarterCategoryInput,
} from './setupTypes';
import type { IconName } from '@/src/types/domainIcons';
import type { WorkplaceId } from '@/src/types/ids';

function defaultsFor<T extends { name: string }>(names: string[], suggestions: readonly T[]): T[] {
  return names
    .map(name => suggestions.find(item => item.name === name))
    .filter((item): item is T => item !== undefined);
}

function SetupScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const journeyId = mode === 'full' ? 'create_workplace' : 'first_run';
  const operationId = useMemo(() => generator() as WorkplaceId, []);
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
            if (!workplaceId) throw new Error('Workplace publication failed');
            return { kind: 'workplace_created', workplaceId };
          },
          workplaceCreation: async draft => {
            const workplaceId = await finishSetup(draft);
            if (!workplaceId) throw new Error('Workplace publication failed');
            return { kind: 'workplace_created', workplaceId };
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
  const [workplaceIcon, setWorkplaceIcon] = useState<IconName>(
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
  const [themeId, setThemeId] = useState<(typeof ThemeIds)[keyof typeof ThemeIds]>(
    existingDraft && 'appearance' in existingDraft
      ? (existingDraft.appearance?.themeId.value ?? ThemeIds.DEEP_SPACE)
      : ThemeIds.DEEP_SPACE,
  );
  const [fontId, setFontId] = useState<(typeof FontIds)[keyof typeof FontIds]>(
    existingDraft && 'appearance' in existingDraft
      ? (existingDraft.appearance?.fontId.value ?? FontIds.DEEP_SPACE)
      : FontIds.DEEP_SPACE,
  );
  const [busy, setBusy] = useState(false);
  const [workplaceStep, setWorkplaceStep] = useState<
    'identity' | 'currency' | 'accounts' | 'categories'
  >('identity');

  const advance = async (nextSlice: SetupSliceId, output: SetupSliceOutput) => {
    setBusy(true);
    try {
      if (slice === 'device')
        finishDeviceSetup(output as Extract<SetupSliceOutput, { displayName: unknown }>);
      await (
        coordinator.accept as (sliceId: SetupSliceId, output: SetupSliceOutput) => Promise<void>
      )(slice, output);
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

  const goTo = (target: SetupSliceId) => {
    if (coordinator.getDraft().acceptedSlices.includes(target)) coordinator.edit(target);
    if (target === 'workplace') setWorkplaceStep('identity');
    setSlice(target);
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
                onBack={() => goTo('device')}
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
            onBack={() => goTo('workplace')}
            isCompleting={busy}
          />
        );
      case 'summary':
        return (
          <View testID="onboarding-summary-step" style={{ flex: 1 }}>
            <OnboardingReviewStep
              name={name}
              workplaceName={workplaceOutput.name.value}
              workplaceIcon={workplaceIcon}
              selectedCurrency={currency}
              accountCount={accounts.length}
              categoryCount={categories.length}
              themeId={themeId}
              fontId={fontId}
              onChangeWorkplace={() => goTo('workplace')}
              onChangeProfile={() => goTo('device')}
              onChangeCurrency={() => goTo('workplace')}
              onChangeAccounts={() => goTo('workplace')}
              onChangeCategories={() => goTo('workplace')}
              onChangeAppearance={() => goTo('appearance')}
              onConfirm={finish}
              onBack={() => goTo('appearance')}
              isCompleting={busy}
              isImportedWorkplace={false}
              showAppearance
            />
          </View>
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
