import { LoadingView } from '@/src/components/core';
import { Box } from '@/src/design-system';
import { ONBOARDING_STRINGS as copy } from '@/src/constants/copy/domains/onboardingStrings';
import { startFirstRunRestoreFromDeviceName } from '@/src/features/setup';
import { analytics } from '@/src/services/analytics';
import { AppConfig } from '@/src/constants/app-config';
import {
  acknowledgeCurrentPrivacyPolicy,
  hasAcknowledgedCurrentPrivacyPolicy,
  subscribeToPrivacyPolicyAcknowledgement,
} from '@/src/services/legal/privacyPolicyAcceptance';
import { AppNavigation } from '@/src/utils/navigation';
import { toast } from '@/src/utils/alerts';
import { logger } from '@/src/utils/logger';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { OnboardingChrome, onboardingStage, SafeToSpendHeader } from './chrome';
import { commitCashClarity } from './commitCashClarity';
import {
  createInitialDraft,
  hasSpendableAccount,
  type CashClarityDraft,
  type OnboardingStep,
} from './draft';
import {
  defaultDeviceDisplayName,
  defaultOnboardingCurrency,
  defaultWorkplaceName,
} from './localeDefaults';
import { projectCashClarityDraft } from './projectCashClarityDraft';
import { explainDraftTransition } from './draftTransitionModel';
import { ONBOARDING_STEPS } from './flow';
import {
  ClarityScene,
  CurrencyScene,
  IncomeScene,
  MoneyScene,
  ProtectScene,
  ReserveScene,
  WelcomeScene,
} from './scenes';

export function OnboardingScreen() {
  const privacyAcknowledged = useSyncExternalStore(
    subscribeToPrivacyPolicyAcknowledgement,
    hasAcknowledgedCurrentPrivacyPolicy,
    hasAcknowledgedCurrentPrivacyPolicy,
  );
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [history, setHistory] = useState<OnboardingStep[]>([]);
  const [{ draft, latestDraftChange }, setDraftState] = useState<{
    readonly draft: CashClarityDraft;
    readonly latestDraftChange: string | null;
  }>(() => ({
    draft: createInitialDraft(defaultOnboardingCurrency(), defaultWorkplaceName()),
    latestDraftChange: null,
  }));
  const [busy, setBusy] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [heard, setHeard] = useState<string | null>(null);
  const projection = useMemo(() => projectCashClarityDraft(draft), [draft]);
  const showSafeToSpend =
    step === 'now' || step === 'next' || step === 'protect' || step === 'reserve';
  const spendable = hasSpendableAccount(draft.accounts);

  const updateDraft = (update: (current: CashClarityDraft) => CashClarityDraft) => {
    setDraftState(current => {
      const next = update(current.draft);
      if (next === current.draft) return current;
      return { draft: next, latestDraftChange: explainDraftTransition(current.draft, next) };
    });
  };

  const clearDraftChange = () => {
    setDraftState(current =>
      current.latestDraftChange == null ? current : { ...current, latestDraftChange: null },
    );
  };

  const go = (next: OnboardingStep) => {
    clearDraftChange();
    const fromIndex = ONBOARDING_STEPS.indexOf(step);
    const toIndex = ONBOARDING_STEPS.indexOf(next);
    if (toIndex >= 0 && fromIndex > toIndex) {
      setHistory(current => {
        const cut = current.lastIndexOf(next);
        return cut >= 0
          ? current.slice(0, cut)
          : current.filter(entry => ONBOARDING_STEPS.indexOf(entry) < toIndex);
      });
      setStep(next);
      return;
    }
    setHistory(current => [...current, step]);
    setStep(next);
  };

  const needAccount = () => {
    toast.error(copy.needAccountForPlanned);
    if (step !== 'now') go('now');
  };

  const back = () => {
    const previous = history[history.length - 1];
    setHeard(null);
    clearDraftChange();
    if (!previous) {
      AppNavigation.back();
      return;
    }
    setHistory(current => current.slice(0, -1));
    setStep(previous);
  };

  const advance = (next: OnboardingStep, echo?: string) => {
    setHeard(echo ?? null);
    go(next);
  };

  const startRestore = () => {
    const name = (draft.displayName ?? '').trim() || defaultDeviceDisplayName();
    startFirstRunRestoreFromDeviceName(name);
    AppNavigation.toSetupJourney('first_run_restore');
  };

  const enter = async () => {
    setFinishError(null);
    setBusy(true);
    try {
      await commitCashClarity(draft);
      AppNavigation.toDashboard();
    } catch (error) {
      logger.error('[Onboarding] Failed to finish setup', error);
      setFinishError('We could not finish setup. Check your details and try again.');
    } finally {
      setBusy(false);
    }
  };

  const scene =
    busy && step !== 'clarity' ? (
      <LoadingView loading text={copy.finishing} />
    ) : step === 'welcome' ? (
      <WelcomeScene
        name={draft.displayName ?? ''}
        onNameChange={displayName => updateDraft(current => ({ ...current, displayName }))}
        privacyAcknowledged={privacyAcknowledged}
        onAcknowledgePrivacy={() => {
          acknowledgeCurrentPrivacyPolicy();
          analytics.logPrivacyPolicyAcknowledged(AppConfig.legal.privacyPolicyVersion);
        }}
        onPrivacyNotice={AppNavigation.toPrivacyNotice}
        onStart={() => {
          const name = (draft.displayName ?? '').trim();
          if (!name) return;
          go('currency');
        }}
        onRestore={startRestore}
      />
    ) : step === 'currency' ? (
      <CurrencyScene
        currency={draft.currency}
        onSelectCurrency={currency => updateDraft(current => ({ ...current, currency }))}
        onContinue={() => {
          const name = (draft.displayName ?? '').trim();
          advance('now', name ? copy.confirmYou(name) : undefined);
        }}
        onBack={back}
      />
    ) : step === 'now' ? (
      <MoneyScene
        currency={draft.currency}
        accounts={draft.accounts}
        onAccountsChange={accounts => updateDraft(current => ({ ...current, accounts }))}
        onContinue={heard => advance('next', heard)}
        onSkip={() => {
          updateDraft(current => ({ ...current, accounts: [] }));
          advance('next', copy.clarityNoCashYet);
        }}
        onBack={back}
        onNeedAccount={needAccount}
      />
    ) : step === 'next' ? (
      <IncomeScene
        currency={draft.currency}
        income={draft.income}
        onIncomeChange={income => updateDraft(current => ({ ...current, income }))}
        onContinue={heard => advance('protect', heard)}
        onBack={back}
        hasSpendable={spendable}
        onNeedAccount={needAccount}
      />
    ) : step === 'protect' ? (
      <ProtectScene
        currency={draft.currency}
        commitment={draft.commitment}
        onCommitmentChange={commitment => updateDraft(current => ({ ...current, commitment }))}
        onContinue={heard => advance('reserve', heard)}
        onBack={back}
        hasSpendable={spendable}
        onNeedAccount={needAccount}
      />
    ) : step === 'reserve' ? (
      <ReserveScene
        currency={draft.currency}
        budget={draft.budget}
        onBudgetChange={budget => updateDraft(current => ({ ...current, budget }))}
        onContinue={heard => advance('clarity', heard)}
        onBack={back}
        hasSpendable={spendable}
        onNeedAccount={needAccount}
      />
    ) : (
      <ClarityScene
        currency={draft.currency}
        draft={draft}
        projection={projection}
        finishing={busy}
        finishError={finishError}
        onEnter={() => void enter()}
        onBack={back}
      />
    );

  return (
    <OnboardingChrome
      testID="onboarding-screen"
      stage={onboardingStage(step)}
      header={
        showSafeToSpend ? (
          <SafeToSpendHeader
            amount={projection.safeToSpend}
            currency={draft.currency}
            change={latestDraftChange ?? heard}
          />
        ) : null
      }
    >
      <Box flex={1} minHeight={0}>
        {scene}
      </Box>
    </OnboardingChrome>
  );
}
