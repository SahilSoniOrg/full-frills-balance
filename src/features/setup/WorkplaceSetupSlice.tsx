import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from '@/src/constants/defaults';
import { AppConfig } from '@/src/constants';
import { WorkplaceAccountSelectionStep } from '@/src/components/common/workplace-setup/WorkplaceAccountSelectionStep';
import { WorkplaceCategorySelectionStep } from '@/src/components/common/workplace-setup/WorkplaceCategorySelectionStep';
import { WorkplaceCurrencyStep } from '@/src/components/common/workplace-setup/WorkplaceCurrencyStep';
import { WorkplaceSetupLayout } from '@/src/components/common/workplace-setup/WorkplaceSetupLayout';
import { OnboardingWorkplaceStepComponent } from '@/src/features/onboarding';
import { AppButton } from '@/src/components/core';
import { useState } from 'react';
import type { IconName } from '@/src/types/domainIcons';
import type {
  StarterAccountInput,
  StarterCategoryInput,
  WorkplaceSetupOutput,
  WorkplaceSetupPrefill,
} from './setupTypes';

function importedStartStep(initial: WorkplaceSetupPrefill | undefined): 'identity' | 'currency' {
  const hasIdentity = Boolean(initial?.name?.value.trim()) && initial?.icon?.source === 'imported';
  const missingCurrency = initial?.baseCurrency?.source !== 'imported';
  return hasIdentity && missingCurrency ? 'currency' : 'identity';
}

function keepImported<T>(initial: { value: T; source: string } | undefined, value: T) {
  return initial?.source === 'imported' && initial.value === value ? 'imported' : 'user_entered';
}

function defaultsFor<T extends { name: string }>(names: string[], suggestions: readonly T[]): T[] {
  return names
    .map(name => suggestions.find(item => item.name === name))
    .filter((item): item is T => item !== undefined);
}

export function WorkplaceSetupSlice({
  displayName,
  initial,
  totalSteps,
  books = 'starters',
  isCompleting,
  onContinue,
  onBack,
  onRestore,
}: {
  readonly displayName: string;
  readonly initial?: WorkplaceSetupOutput | WorkplaceSetupPrefill;
  readonly totalSteps: number;
  readonly books?: 'starters' | 'imported';
  readonly isCompleting: boolean;
  readonly onContinue: (output: WorkplaceSetupOutput) => void;
  readonly onBack: () => void;
  readonly onRestore?: () => void;
}) {
  const [step, setStep] = useState<'identity' | 'currency' | 'accounts' | 'categories'>(() =>
    books === 'imported' ? importedStartStep(initial) : 'identity',
  );
  const [workplaceName, setWorkplaceName] = useState(initial?.name?.value ?? '');
  const [workplaceIcon, setWorkplaceIcon] = useState<IconName>(initial?.icon?.value ?? 'briefcase');
  const [currency, setCurrency] = useState(
    initial?.baseCurrency?.value ?? AppConfig.defaultCurrency,
  );
  const [accounts, setAccounts] = useState(
    initial && 'selectedAccounts' in initial && initial.selectedAccounts
      ? initial.selectedAccounts.map(item => item.name)
      : ['Cash', 'Bank'],
  );
  const [categories, setCategories] = useState(
    initial && 'selectedCategories' in initial && initial.selectedCategories
      ? initial.selectedCategories.map(item => item.name)
      : ['Salary', 'Food & Drink', 'Groceries', 'Bills'],
  );

  const derivedName = workplaceName || `${displayName.trim() || 'User'}'s Personal workplace`;
  const imported = books === 'imported';
  const resolvedName = workplaceName.trim() || derivedName;
  const output: WorkplaceSetupOutput = {
    name: {
      value: resolvedName,
      source: keepImported(initial?.name, resolvedName),
    },
    icon: { value: workplaceIcon, source: keepImported(initial?.icon, workplaceIcon) },
    baseCurrency: { value: currency, source: keepImported(initial?.baseCurrency, currency) },
    selectedAccounts: imported
      ? []
      : (defaultsFor(accounts, DEFAULT_ACCOUNTS) as StarterAccountInput[]),
    selectedCategories: imported
      ? []
      : (defaultsFor(categories, DEFAULT_CATEGORIES) as StarterCategoryInput[]),
    acceptedCheckpoints: imported
      ? ['identity', 'currency']
      : ['identity', 'currency', 'accounts', 'categories'],
  };

  return (
    <WorkplaceSetupLayout currentStep={2} totalSteps={totalSteps}>
      {step === 'identity' && (
        <>
          <OnboardingWorkplaceStepComponent
            name={derivedName}
            icon={workplaceIcon}
            onNameChange={setWorkplaceName}
            onIconChange={setWorkplaceIcon}
            onContinue={() => setStep('currency')}
            onBack={onBack}
            isCompleting={isCompleting}
          />
          {onRestore ? (
            <AppButton variant="ghost" onPress={onRestore} disabled={isCompleting}>
              Restore a backup instead
            </AppButton>
          ) : null}
        </>
      )}
      {step === 'currency' && (
        <WorkplaceCurrencyStep
          selectedCurrency={currency}
          onSelectCurrency={setCurrency}
          onContinue={() => (imported ? onContinue(output) : setStep('accounts'))}
          onBack={() => setStep('identity')}
          isCompleting={isCompleting}
        />
      )}
      {!imported && step === 'accounts' && (
        <WorkplaceAccountSelectionStep
          selectedAccounts={accounts}
          customAccounts={[]}
          onToggleAccount={n =>
            setAccounts(v => (v.includes(n) ? v.filter(x => x !== n) : [...v, n]))
          }
          onAddCustomAccount={() => undefined}
          onContinue={() => setStep('categories')}
          onBack={() => setStep('currency')}
          isCompleting={isCompleting}
        />
      )}
      {!imported && step === 'categories' && (
        <WorkplaceCategorySelectionStep
          selectedCategories={categories}
          customCategories={[]}
          onToggleCategory={n =>
            setCategories(v => (v.includes(n) ? v.filter(x => x !== n) : [...v, n]))
          }
          onAddCustomCategory={() => undefined}
          onContinue={() => onContinue(output)}
          onBack={() => setStep('accounts')}
          isCompleting={isCompleting}
        />
      )}
    </WorkplaceSetupLayout>
  );
}
