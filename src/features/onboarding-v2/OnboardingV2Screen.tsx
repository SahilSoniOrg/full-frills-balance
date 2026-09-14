import { AppText, LoadingView } from '@/src/components/core';
import { Box, Inline } from '@/src/design-system';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { ONBOARDING_V2_STRINGS as copy } from '@/src/constants/copy/domains/onboardingV2Strings';
import { startFirstRunRestoreFromDeviceName } from '@/src/features/setup';
import { analytics } from '@/src/services/analytics';
import { AppConfig } from '@/src/constants/app-config';
import {
  acknowledgeCurrentPrivacyPolicy,
  hasAcknowledgedCurrentPrivacyPolicy,
  subscribeToPrivacyPolicyAcknowledgement,
} from '@/src/services/legal/privacyPolicyAcceptance';
import { toast } from '@/src/utils/alerts';
import { AppNavigation } from '@/src/utils/navigation';
import type { IconName } from '@/src/types/domainIcons';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { OnboardingV2Chrome, ONBOARDING_STAGES } from './chrome';
import { commitCashClarity } from './commitCashClarity';
import {
  createInitialDraft,
  hasSpendableAccount,
  type CashClarityDraft,
  type OnboardingV2Step,
} from './draft';
import {
  defaultDeviceDisplayName,
  defaultOnboardingCurrency,
  defaultWorkplaceName,
} from './localeDefaults';
import { projectCashClarityDraft } from './projectCashClarityDraft';
import {
  ClarityScene,
  CurrencyScene,
  IncomeScene,
  MoneyScene,
  ProtectScene,
  ReserveScene,
  ReviewScene,
  YouScene,
  WelcomeScene,
  WorkspaceScene,
} from './scenes';

const FLOW: readonly OnboardingV2Step[] = [
  'welcome',
  'workspace',
  'currency',
  'now',
  'next',
  'protect',
  'reserve',
  'clarity',
  'review',
];

export function OnboardingV2Screen() {
  const privacyAcknowledged = useSyncExternalStore(
    subscribeToPrivacyPolicyAcknowledgement,
    hasAcknowledgedCurrentPrivacyPolicy,
    hasAcknowledgedCurrentPrivacyPolicy,
  );
  const [step, setStep] = useState<OnboardingV2Step>('welcome');
  const [history, setHistory] = useState<OnboardingV2Step[]>([]);
  const [editingFromReview, setEditingFromReview] = useState(false);
  const [draft, setDraft] = useState<CashClarityDraft>(() =>
    createInitialDraft(defaultOnboardingCurrency(), defaultWorkplaceName()),
  );
  const [busy, setBusy] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const projection = useMemo(() => projectCashClarityDraft(draft), [draft]);
  const showSafeToSpend =
    step === 'now' || step === 'next' || step === 'protect' || step === 'reserve';
  const spendable = hasSpendableAccount(draft.accounts);

  const go = (next: OnboardingV2Step, fromReview = false) => {
    setEditingFromReview(fromReview);
    if (fromReview) {
      setHistory(current => [...current, step]);
      setStep(next);
      return;
    }
    const fromIndex = FLOW.indexOf(step);
    const toIndex = FLOW.indexOf(next);
    if (toIndex >= 0 && fromIndex > toIndex) {
      setHistory(current => {
        const cut = current.lastIndexOf(next);
        return cut >= 0
          ? current.slice(0, cut)
          : current.filter(entry => FLOW.indexOf(entry) < toIndex);
      });
      setStep(next);
      return;
    }
    if (next === 'review') {
      setHistory(['welcome', 'clarity']);
      setStep('review');
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
    if (!previous) {
      AppNavigation.back();
      return;
    }
    if (previous === 'review') setEditingFromReview(false);
    setHistory(current => current.slice(0, -1));
    setStep(previous);
  };

  const advance = (next: OnboardingV2Step, echo?: string) => {
    if (!editingFromReview) setHeard(echo ?? null);
    else setHeard(null);
    if (editingFromReview) {
      setEditingFromReview(false);
      back();
      return;
    }
    go(next);
  };

  const startRestore = () => {
    const name = (draft.displayName ?? '').trim() || defaultDeviceDisplayName();
    startFirstRunRestoreFromDeviceName(name);
    AppNavigation.toSetupJourney('first_run_restore');
  };

  const enter = async () => {
    setBusy(true);
    try {
      await commitCashClarity(draft);
      AppNavigation.toDashboard();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not finish setup.');
    } finally {
      setBusy(false);
    }
  };

  const scene =
    busy && step !== 'review' ? (
      <LoadingView loading text={copy.finishing} />
    ) : step === 'welcome' ? (
      <WelcomeScene
        name={draft.displayName ?? ''}
        onNameChange={displayName => setDraft(current => ({ ...current, displayName }))}
        privacyAcknowledged={privacyAcknowledged}
        onAcknowledgePrivacy={() => {
          acknowledgeCurrentPrivacyPolicy();
          analytics.logPrivacyPolicyAcknowledged(AppConfig.legal.privacyPolicyVersion);
        }}
        onPrivacyNotice={AppNavigation.toPrivacyNotice}
        onStart={() => {
          const name = (draft.displayName ?? '').trim();
          if (!name) return;
          setHeard(copy.confirmYou(name));
          go('workspace');
        }}
        onRestore={startRestore}
      />
    ) : step === 'you' ? (
      <YouScene
        name={draft.displayName ?? ''}
        onNameChange={displayName => setDraft(current => ({ ...current, displayName }))}
        onContinue={heard => advance('workspace', heard)}
        onBack={back}
      />
    ) : step === 'workspace' ? (
      <WorkspaceScene
        name={draft.workplaceName}
        icon={draft.workplaceIcon}
        onNameChange={name => setDraft(current => ({ ...current, workplaceName: name }))}
        onIconChange={(icon: IconName) =>
          setDraft(current => ({ ...current, workplaceIcon: icon }))
        }
        onContinue={() => advance('currency')}
        onBack={back}
      />
    ) : step === 'currency' ? (
      <CurrencyScene
        currency={draft.currency}
        onSelectCurrency={currency => setDraft(current => ({ ...current, currency }))}
        onContinue={() => advance('now')}
        onBack={back}
      />
    ) : step === 'now' ? (
      <MoneyScene
        currency={draft.currency}
        accounts={draft.accounts}
        onAccountsChange={accounts => setDraft(current => ({ ...current, accounts }))}
        onContinue={heard => advance('next', heard)}
        onSkip={() => {
          setDraft(current => ({ ...current, accounts: [] }));
          advance('next', copy.clarityNoCashYet);
        }}
        onBack={back}
        onNeedAccount={needAccount}
      />
    ) : step === 'next' ? (
      <IncomeScene
        currency={draft.currency}
        income={draft.income}
        onIncomeChange={income => setDraft(current => ({ ...current, income }))}
        onContinue={heard => advance('protect', heard)}
        onBack={back}
        hasSpendable={spendable}
        onNeedAccount={needAccount}
      />
    ) : step === 'protect' ? (
      <ProtectScene
        currency={draft.currency}
        commitment={draft.commitment}
        onCommitmentChange={commitment => setDraft(current => ({ ...current, commitment }))}
        onContinue={heard => advance('reserve', heard)}
        onBack={back}
        hasSpendable={spendable}
        onNeedAccount={needAccount}
      />
    ) : step === 'reserve' ? (
      <ReserveScene
        currency={draft.currency}
        budget={draft.budget}
        onBudgetChange={budget => setDraft(current => ({ ...current, budget }))}
        onContinue={heard => advance('clarity', heard)}
        onBack={back}
        hasSpendable={spendable}
        onNeedAccount={needAccount}
      />
    ) : step === 'clarity' ? (
      <ClarityScene
        currency={draft.currency}
        projection={projection}
        onContinue={() => advance('review')}
        onBack={back}
      />
    ) : (
      <ReviewScene
        draft={draft}
        projection={projection}
        finishing={busy}
        onEnter={() => void enter()}
        onChange={() => {
          setHeard(null);
          setEditingFromReview(false);
          setHistory(['review']);
          setStep('now');
        }}
        onEdit={next => go(next, true)}
        onBack={back}
      />
    );

  return (
    <OnboardingV2Chrome
      testID="onboarding-v2-screen"
      stage={ONBOARDING_STAGES[step]}
      keyboardAvoiding={
        step === 'welcome' ||
        step === 'you' ||
        step === 'workspace' ||
        step === 'now' ||
        step === 'next' ||
        step === 'protect' ||
        step === 'reserve'
      }
    >
      {showSafeToSpend ? (
        <Inline align="center" justify="space-between" paddingBottom="sm">
          <AppText variant="caption" color="secondary">
            {copy.safeToSpend}
          </AppText>
          <MoneyText
            amount={projection.safeToSpend}
            currencyCode={draft.currency}
            formatStyle="compact"
            variant="body"
            weight="semibold"
            testID="onboarding-v2-sts"
          />
        </Inline>
      ) : null}
      {heard && step !== 'welcome' && step !== 'review' ? (
        <Box paddingBottom="sm">
          <AppText variant="caption" color="secondary" testID="onboarding-v2-heard">
            {heard}
          </AppText>
        </Box>
      ) : null}
      <Box flex={1}>{scene}</Box>
    </OnboardingV2Chrome>
  );
}
