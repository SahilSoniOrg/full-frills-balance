import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from '@/src/constants/defaults';
import { AppConfig } from '@/src/constants';
import { WorkplaceAccountSelectionStep } from '@/src/components/common/workplace-setup/WorkplaceAccountSelectionStep';
import { WorkplaceCategorySelectionStep } from '@/src/components/common/workplace-setup/WorkplaceCategorySelectionStep';
import { WorkplaceCurrencyStep } from '@/src/components/common/workplace-setup/WorkplaceCurrencyStep';
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

function starterOutput<T extends { name: string; type: string; icon: IconName }>(
  items: readonly T[],
): StarterAccountInput[] {
  return items.map(({ name, type, icon }) => ({
    name,
    type: type as StarterAccountInput['type'],
    icon,
  }));
}

export function WorkplaceSetupSlice({
  displayName,
  initial,
  identityMode = 'editable',
  books = 'starters',
  isCompleting,
  onContinue,
  onBack,
  onRestore,
}: {
  readonly displayName: string;
  readonly initial?: WorkplaceSetupOutput | WorkplaceSetupPrefill;
  /** The journey recipe decides whether identity is seeded or editable. */
  readonly identityMode?: 'automatic' | 'editable';
  readonly books?: 'starters' | 'imported';
  readonly isCompleting: boolean;
  readonly onContinue: (output: WorkplaceSetupOutput) => void;
  readonly onBack: () => void;
  readonly onRestore?: () => void;
}) {
  const [step, setStep] = useState<'identity' | 'currency' | 'accounts' | 'categories'>(() => {
    if (identityMode === 'automatic') return 'currency';
    return books === 'imported' ? importedStartStep(initial) : 'identity';
  });
  const [workplaceName, setWorkplaceName] = useState(initial?.name?.value ?? '');
  const [hasEditedWorkplaceName, setHasEditedWorkplaceName] = useState(false);
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
  const [customAccounts, setCustomAccounts] = useState<StarterAccountInput[]>([]);
  const [customCategories, setCustomCategories] = useState<StarterCategoryInput[]>([]);
  const visibleStep = identityMode === 'automatic' && step === 'identity' ? 'currency' : step;

  const derivedName = workplaceName || `${displayName.trim() || 'User'}'s Personal workplace`;
  const inputName = hasEditedWorkplaceName ? workplaceName : derivedName;
  const imported = books === 'imported';
  const resolvedName = workplaceName.trim() || derivedName;
  const output: WorkplaceSetupOutput = {
    name: {
      value: resolvedName,
      source: workplaceName.trim() ? keepImported(initial?.name, resolvedName) : 'defaulted',
    },
    icon: {
      value: workplaceIcon,
      source: initial?.icon ? keepImported(initial.icon, workplaceIcon) : 'defaulted',
    },
    baseCurrency: { value: currency, source: keepImported(initial?.baseCurrency, currency) },
    selectedAccounts: imported
      ? []
      : [
          ...starterOutput(defaultsFor(accounts, DEFAULT_ACCOUNTS)),
          ...customAccounts.filter(item => accounts.includes(item.name)),
        ],
    selectedCategories: imported
      ? []
      : [
          ...starterOutput(defaultsFor(categories, DEFAULT_CATEGORIES)).map(item => ({
            ...item,
            type: item.type as StarterCategoryInput['type'],
          })),
          ...customCategories.filter(item => categories.includes(item.name)),
        ],
    acceptedCheckpoints: imported
      ? ['identity', 'currency']
      : ['identity', 'currency', 'accounts', 'categories'],
  };

  return (
    <>
      {visibleStep === 'identity' && (
        <>
          <OnboardingWorkplaceStepComponent
            name={inputName}
            icon={workplaceIcon}
            onNameChange={name => {
              setHasEditedWorkplaceName(true);
              setWorkplaceName(name);
            }}
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
      {visibleStep === 'currency' && (
        <WorkplaceCurrencyStep
          selectedCurrency={currency}
          onSelectCurrency={setCurrency}
          onContinue={() => (imported ? onContinue(output) : setStep('accounts'))}
          onBack={() => (identityMode === 'automatic' ? onBack() : setStep('identity'))}
          isCompleting={isCompleting}
        />
      )}
      {!imported && visibleStep === 'accounts' && (
        <WorkplaceAccountSelectionStep
          selectedAccounts={accounts}
          customAccounts={customAccounts.map(item => ({
            ...item,
            type: item.type as 'ASSET' | 'LIABILITY',
          }))}
          onToggleAccount={n =>
            setAccounts(v => (v.includes(n) ? v.filter(x => x !== n) : [...v, n]))
          }
          onAddCustomAccount={(name, type, icon) => {
            setCustomAccounts(items => [...items, { name, type, icon } as StarterAccountInput]);
            setAccounts(items => (items.includes(name) ? items : [...items, name]));
          }}
          onContinue={() => setStep('categories')}
          onBack={() => setStep('currency')}
          isCompleting={isCompleting}
        />
      )}
      {!imported && visibleStep === 'categories' && (
        <WorkplaceCategorySelectionStep
          selectedCategories={categories}
          customCategories={customCategories.map(item => ({
            ...item,
            type: item.type as 'INCOME' | 'EXPENSE',
          }))}
          onToggleCategory={n =>
            setCategories(v => (v.includes(n) ? v.filter(x => x !== n) : [...v, n]))
          }
          onAddCustomCategory={(name, type, icon) => {
            setCustomCategories(items => [...items, { name, type, icon } as StarterCategoryInput]);
            setCategories(items => (items.includes(name) ? items : [...items, name]));
          }}
          onContinue={() => onContinue(output)}
          onBack={() => setStep('accounts')}
          isCompleting={isCompleting}
        />
      )}
    </>
  );
}
