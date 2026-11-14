import { AppConfig } from '@/src/constants';
import { WorkplaceCurrencyStep } from '@/src/features/setup/components/workplace-setup/WorkplaceCurrencyStep';
import { WorkplaceIdentityStep } from './WorkplaceIdentityStep';
import { Icon, AppButton } from '@/src/components/core';
import { useLayoutEffect, useState } from 'react';
import type { IconName } from '@/src/types/domainIcons';
import { generateWorkplaceName } from '@/src/utils/workplaceName';
import type {
  WorkplaceCheckpoint,
  WorkplaceSetupOutput,
  WorkplaceSetupPrefill,
} from './setupTypes';
import { resolveWorkplaceStartCheckpoint } from './visibleSetupProgress';

function keepImported<T>(initial: { value: T; source: string } | undefined, value: T) {
  return initial?.source === 'imported' && initial.value === value ? 'imported' : 'user_entered';
}

export function WorkplaceSetupSlice({
  initial,
  identityMode = 'editable',
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
      books: 'imported',
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
  // Restore/imported mode only: starter account/category selection is retired.
  const visibleStep = identityMode === 'automatic' && step === 'identity' ? 'currency' : step;
  useLayoutEffect(() => {
    onCheckpointChange?.(visibleStep);
  }, [onCheckpointChange, visibleStep]);

  const derivedName = workplaceName || defaultWorkplaceName;
  const canGenerateName = !hasEditedWorkplaceName && !initial?.name?.value.trim();
  const inputName = hasEditedWorkplaceName ? workplaceName : derivedName;
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
    selectedAccounts: [],
    selectedCategories: [],
    acceptedCheckpoints: ['identity', 'currency'],
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
          onContinue={() => onContinue(output)}
          onBack={() =>
            identityMode === 'automatic' || initialStep === 'currency'
              ? onBack()
              : setStep('identity')
          }
          isCompleting={isCompleting}
        />
      )}

    </>
  );
}
