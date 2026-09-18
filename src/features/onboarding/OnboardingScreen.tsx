import { AppText, LoadingView } from '@/src/components/core';
import { Box, Stack } from '@/src/design-system';
import { MoneyText } from '@/src/components/shared/MoneyText';
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
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { OnboardingChrome, ONBOARDING_STAGES } from './chrome';
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
import { explainDraftTransition } from './draftTransition';
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
  const [draft, setDraft] = useState<CashClarityDraft>(() =>
    createInitialDraft(defaultOnboardingCurrency(), defaultWorkplaceName()),
  );
  const [busy, setBusy] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [heard, setHeard] = useState<string | null>(null);
  const [latestDraftChange, setLatestDraftChange] = useState<string | null>(null);
  const previousDraftRef = useRef(draft);
  const projection = useMemo(() => projectCashClarityDraft(draft), [draft]);
  const showSafeToSpend =
    step === 'now' || step === 'next' || step === 'protect' || step === 'reserve';
  const spendable = hasSpendableAccount(draft.accounts);

  useEffect(() => {
    if (previousDraftRef.current === draft) return;
    const change = explainDraftTransition(previousDraftRef.current, draft);
    previousDraftRef.current = draft;
    if (change) setLatestDraftChange(change);
  }, [draft]);

  const go = (next: OnboardingStep) => {
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
          go('currency');
        }}
        onRestore={startRestore}
      />
    ) : step === 'currency' ? (
      <CurrencyScene
        currency={draft.currency}
        onSelectCurrency={currency => setDraft(current => ({ ...current, currency }))}
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
      stage={ONBOARDING_STAGES[step]}
      renderHeader={({ isKeyboardVisible }) => (
        <>
          {showSafeToSpend ? (
            isKeyboardVisible ? (
              <Box paddingVertical="sm">
                <Stack direction="row" align="center" justify="space-between" gap="md">
                  <AppText variant="caption" color="secondary" weight="medium">
                    {copy.safeToSpend}
                  </AppText>
                  <MoneyText
                    amount={projection.safeToSpend}
                    currencyCode={draft.currency}
                    formatStyle="sts"
                    variant="subheading"
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                    testID="onboarding-sts"
                  />
                </Stack>
              </Box>
            ) : (
              <Stack gap="xs" paddingTop="sm" paddingBottom="md">
                <AppText variant="body" color="secondary" weight="medium">
                  {copy.safeToSpend}
                </AppText>
                <MoneyText
                  amount={projection.safeToSpend}
                  currencyCode={draft.currency}
                  formatStyle="sts"
                  variant="hero"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                  testID="onboarding-sts"
                />
              </Stack>
            )
          ) : null}
          {showSafeToSpend && (latestDraftChange || heard) ? (
            <Box paddingBottom="sm">
              <AppText
                variant="caption"
                color="secondary"
                numberOfLines={2}
                testID="onboarding-sts-change"
              >
                {latestDraftChange ?? heard}
              </AppText>
            </Box>
          ) : null}
        </>
      )}
    >
      <Box flex={1} minHeight={0}>
        {scene}
      </Box>
    </OnboardingChrome>
  );
}
