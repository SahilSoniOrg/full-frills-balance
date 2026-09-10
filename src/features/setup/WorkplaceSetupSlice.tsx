import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from '@/src/constants/defaults';
import { AppConfig } from '@/src/constants';
import { WorkplaceAccountSelectionStep } from '@/src/features/setup/components/workplace-setup/WorkplaceAccountSelectionStep';
import { WorkplaceCategorySelectionStep } from '@/src/features/setup/components/workplace-setup/WorkplaceCategorySelectionStep';
import { WorkplaceCurrencyStep } from '@/src/features/setup/components/workplace-setup/WorkplaceCurrencyStep';
import { WorkplaceIdentityStep } from './WorkplaceIdentityStep';
import { Icon, AppButton } from '@/src/components/core';
import { useLayoutEffect, useState } from 'react';
import type { IconName } from '@/src/types/domainIcons';
import { AccountType } from '@/src/types/enums';
import { generateWorkplaceName } from '@/src/utils/workplaceName';
import type {
  StarterAccountInput,
  StarterCategoryInput,
  WorkplaceCheckpoint,
  WorkplaceSetupOutput,
  WorkplaceSetupPrefill,
} from './setupTypes';
import { resolveWorkplaceStartCheckpoint } from './visibleSetupProgress';

function keepImported<T>(initial: { value: T; source: string } | undefined, value: T) {
  return initial?.source === 'imported' && initial.value === value ? 'imported' : 'user_entered';
}

function defaultsFor<T extends { name: string }>(names: string[], suggestions: readonly T[]): T[] {
  return names
    .map(name => suggestions.find(item => item.name === name))
    .filter((item): item is T => item !== undefined);
}

function starterAccountsFromDefaults(names: string[]): StarterAccountInput[] {
  return defaultsFor(names, DEFAULT_ACCOUNTS).map(({ name, type, icon }) => ({ name, type, icon }));
}

function starterCategoriesFromDefaults(names: string[]): StarterCategoryInput[] {
  return defaultsFor(names, DEFAULT_CATEGORIES).map(({ name, type, icon }) => ({
    name,
    type: type === 'INCOME' ? AccountType.INCOME : AccountType.EXPENSE,
    icon,
  }));
}

export function WorkplaceSetupSlice({
  initial,
  identityMode = 'editable',
  books = 'starters',
  initialStep,
  resumeStep,
  isCompleting,
  onContinue,
  onBack,
  onRestore,
  onCheckpointChange,
}: {
  readonly initial?: WorkplaceSetupOutput | WorkplaceSetupPrefill;
  /** The journey recipe decides whether identity is seeded or editable. */
  readonly identityMode?: 'automatic' | 'editable';
  readonly books?: 'starters' | 'imported';
  readonly initialStep?: WorkplaceCheckpoint;
  /** Parent-owned checkpoint used to restore the local step after a remount. */
  readonly resumeStep?: WorkplaceCheckpoint;
  readonly isCompleting: boolean;
  readonly onContinue: (output: WorkplaceSetupOutput) => void;
  readonly onBack: () => void;
  readonly onRestore?: () => void;
  readonly onCheckpointChange?: (step: WorkplaceCheckpoint) => void;
}) {
  const [step, setStep] = useState<WorkplaceCheckpoint>(() =>
    resolveWorkplaceStartCheckpoint({
      identityMode,
      books,
      initial,
      initialStep: initialStep ?? resumeStep,
    }),
  );
  const [defaultWorkplaceName, setDefaultWorkplaceName] = useState(() => generateWorkplaceName());
  const [workplaceName, setWorkplaceName] = useState(initial?.name?.value ?? '');
  const [hasEditedWorkplaceName, setHasEditedWorkplaceName] = useState(false);
  const [workplaceIcon, setWorkplaceIcon] = useState<IconName>(
    initial?.icon?.value ?? Icon.Briefcase,
  );
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
  const [customAccounts, setCustomAccounts] = useState<StarterAccountInput[]>(() => {
    if (!initial || !('selectedAccounts' in initial) || !initial.selectedAccounts) return [];
    return initial.selectedAccounts.filter(
      acc => !DEFAULT_ACCOUNTS.some(def => def.name.toLowerCase() === acc.name.toLowerCase()),
    );
  });
  const [customCategories, setCustomCategories] = useState<StarterCategoryInput[]>(() => {
    if (!initial || !('selectedCategories' in initial) || !initial.selectedCategories) return [];
    return initial.selectedCategories.filter(
      cat => !DEFAULT_CATEGORIES.some(def => def.name.toLowerCase() === cat.name.toLowerCase()),
    );
  });
  const visibleStep = identityMode === 'automatic' && step === 'identity' ? 'currency' : step;
  useLayoutEffect(() => {
    onCheckpointChange?.(visibleStep);
  }, [onCheckpointChange, visibleStep]);

  const derivedName = workplaceName || defaultWorkplaceName;
  const canGenerateName = !hasEditedWorkplaceName && !initial?.name?.value.trim();
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
          ...starterAccountsFromDefaults(accounts),
          ...customAccounts.filter(item => accounts.includes(item.name)),
        ],
    selectedCategories: imported
      ? []
      : [
          ...starterCategoriesFromDefaults(categories),
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
          <WorkplaceIdentityStep
            name={inputName}
            icon={workplaceIcon}
            onNameChange={name => {
              setHasEditedWorkplaceName(true);
              setWorkplaceName(name);
            }}
            onGenerateName={
              canGenerateName
                ? () => {
                    setWorkplaceName('');
                    setDefaultWorkplaceName(generateWorkplaceName());
                  }
                : undefined
            }
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
          onBack={() =>
            identityMode === 'automatic' || initialStep === 'currency'
              ? onBack()
              : setStep('identity')
          }
          isCompleting={isCompleting}
        />
      )}
      {!imported && visibleStep === 'accounts' && (
        <WorkplaceAccountSelectionStep
          selectedAccounts={accounts}
          customAccounts={customAccounts.map(item => ({
            name: item.name,
            icon: item.icon,
            type: item.type === AccountType.LIABILITY ? 'LIABILITY' : 'ASSET',
          }))}
          onToggleAccount={n =>
            setAccounts(v => (v.includes(n) ? v.filter(x => x !== n) : [...v, n]))
          }
          onAddCustomAccount={(name, type, icon) => {
            setCustomAccounts(items => [
              ...items,
              {
                name,
                icon,
                type: type === 'LIABILITY' ? AccountType.LIABILITY : AccountType.ASSET,
              },
            ]);
            setAccounts(items => (items.includes(name) ? items : [...items, name]));
          }}
          onContinue={() => setStep('categories')}
          onBack={() => (initialStep === 'accounts' ? onBack() : setStep('currency'))}
          isCompleting={isCompleting}
        />
      )}
      {!imported && visibleStep === 'categories' && (
        <WorkplaceCategorySelectionStep
          selectedCategories={categories}
          customCategories={customCategories.map(item => ({
            name: item.name,
            icon: item.icon,
            type: item.type === AccountType.INCOME ? 'INCOME' : 'EXPENSE',
          }))}
          onToggleCategory={n =>
            setCategories(v => (v.includes(n) ? v.filter(x => x !== n) : [...v, n]))
          }
          onAddCustomCategory={(name, type, icon) => {
            setCustomCategories(items => [
              ...items,
              {
                name,
                icon,
                type: type === 'INCOME' ? AccountType.INCOME : AccountType.EXPENSE,
              },
            ]);
            setCategories(items => (items.includes(name) ? items : [...items, name]));
          }}
          onContinue={() => onContinue(output)}
          onBack={() => (initialStep === 'categories' ? onBack() : setStep('accounts'))}
          isCompleting={isCompleting}
        />
      )}
    </>
  );
}
