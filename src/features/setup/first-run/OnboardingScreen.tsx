import { AppButton, AppText, LoadingView } from '@/src/components/core';
import { PrivacyAcknowledgementSheet } from '@/src/components/legal/PrivacyAcknowledgementSheet';
import { Box, Stack } from '@/src/design-system';
import { ONBOARDING_STRINGS as copy } from '@/src/constants/copy/domains/onboardingStrings';
import { AppConfig } from '@/src/constants/app-config';
import { startFirstRunRestoreFromDeviceName } from '../SetupCoordinator';
import {
  acknowledgeCurrentPrivacyPolicy,
  hasAcknowledgedCurrentPrivacyPolicy,
  subscribeToPrivacyPolicyAcknowledgement,
} from '@/src/services/legal/privacyPolicyAcceptance';
import { AppNavigation } from '@/src/utils/navigation';
import { analytics } from '@/src/services/analytics';
import { triggerSaveOutcomeHaptic } from '@/src/utils/haptics';
import { logger } from '@/src/utils/logger';
import { useLocalSearchParams } from 'expo-router';
import { getLocales } from 'expo-localization';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useCreationLaunch, type CreationLaunchEntry } from '@/src/contexts/CreationLaunchContext';
import { preferences } from '@/src/services/preferences';
import { finishDeviceSetup } from '../setupFinishers';
import {
  clearSetupDraft,
  discardUnreadableSetupDraft,
  hasUnreadableSetupDraft,
  loadSetupDraft,
  saveSetupDraft,
} from '../SetupDraftStore';
import type {
  CashClaritySetupDraft,
  CreationContext,
  CreationIntent,
  SetupDraft,
} from '../setupTypes';
import { ConversationStep } from './conversationUi';
import { type CollectorSessionHooks } from './collectors';
import { OnboardingChrome, onboardingStage, SafeToSpendHeader } from './chrome';
import {
  CashClarityPublicationError,
  publishCashClarity,
  recoverCashClarityPublication,
} from './commitCashClarity';
import { createCreationSession } from './creationSession';
import { clearPendingCashClarityWorkplaceId } from './pendingWorkplace';
import { hasSpendableAccount, type CashClarityCollection, type OnboardingStep } from './draft';
import { defaultOnboardingCurrency, defaultWorkplaceName } from './localeDefaults';
import {
  prepareCashClarityInput,
  spendableDeferral,
  spendableDependencyIssues,
} from './prepareEffectiveDraft';
import { projectCashClarityDraft } from './projectCashClarityDraft';
import { ResumeSetupSummary } from './ResumeSetupSummary';
import { explainDraftTransition } from './draftTransitionModel';
import {
  trackOnboardingDashboardOpened,
  trackOnboardingFlowResumed,
  trackOnboardingFlowRestarted,
  trackOnboardingFlowStarted,
  trackOnboardingFirstEstimate,
  trackOnboardingResultViewed,
  trackOnboardingSaveResult,
  trackOnboardingStepCompleted,
  trackOnboardingStepDeferred,
  trackOnboardingStepViewed,
  trackOnboardingValidationBlocked,
  type OnboardingErrorCode,
  type OnboardingStepId,
} from './onboardingAnalytics';
import {
  ClarityScene,
  CurrencyScene,
  IncomeScene,
  MoneyScene,
  ProtectScene,
  ReserveScene,
  WelcomeScene,
} from './scenes';

const FLOW_VERSION = '2.0.0';
const startedInRuntime = new Set<string>();
const viewedInRuntime = new Set<string>();
const estimateViewedInRuntime = new Set<string>();
const resultViewedInRuntime = new Set<string>();
const blockedInRuntime = new Set<string>();
const openedInRuntime = new Set<string>();

type Bootstrap =
  | { readonly kind: 'session'; readonly session: CashClaritySetupDraft; readonly resumed: boolean }
  | { readonly kind: 'conflict'; readonly existing: SetupDraft }
  | { readonly kind: 'unreadable' };

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function requestedEntry(
  params: {
    journey?: string | string[];
    context?: string | string[];
    entryPolicy?: string | string[];
  },
  launchEntry?: CreationLaunchEntry,
): { intent: CreationIntent; context: CreationContext; entryPolicy: 'blocking' | 'optional' } {
  if (launchEntry) return launchEntry;
  const requested = firstParam(params.journey);
  const intent: CreationIntent =
    preferences.device.deviceRegistered ||
    requested === 'add_workplace' ||
    requested === 'create_workplace' ||
    requested === 'empty_device_workplace'
      ? 'add_workplace'
      : 'first_run';
  const rawContext = firstParam(params.context);
  const validContext: readonly CreationContext[] = [
    'unregistered_device',
    'registered_empty_device',
    'workplace_picker',
    'existing_workplace_entry',
  ];
  const context: CreationContext =
    intent === 'first_run'
      ? 'unregistered_device'
      : validContext.includes(rawContext as CreationContext) && rawContext !== 'unregistered_device'
        ? (rawContext as CreationContext)
        : 'workplace_picker';
  const entryPolicy =
    intent === 'first_run' || context === 'registered_empty_device' ? 'blocking' : 'optional';
  return { intent, context, entryPolicy };
}

function bootstrapSession(
  entry: ReturnType<typeof requestedEntry>,
  name: string | undefined,
): Bootstrap {
  if (hasUnreadableSetupDraft()) return { kind: 'unreadable' };
  const stored = loadSetupDraft();
  if (stored) {
    if (stored.kind === 'cash_clarity') {
      if (
        stored.intent === entry.intent &&
        stored.context === entry.context &&
        stored.entryPolicy === entry.entryPolicy
      ) {
        return { kind: 'session', session: stored, resumed: true };
      }
      return { kind: 'conflict', existing: stored };
    }
    return { kind: 'conflict', existing: stored };
  }
  const session = createCreationSession({
    ...entry,
    currency: defaultOnboardingCurrency(),
    workplaceName: defaultWorkplaceName(),
    displayName: entry.intent === 'first_run' ? (name ?? '') : (preferences.userName ?? ''),
  });
  return { kind: 'session', session, resumed: false };
}

function analyticsStep(step: OnboardingStep): OnboardingStepId {
  switch (step) {
    case 'welcome':
      return 'welcome';
    case 'currency':
      return 'currency';
    case 'now':
      return 'accounts';
    case 'next':
      return 'income';
    case 'protect':
      return 'payments';
    case 'reserve':
      return 'monthly_limits';
    case 'clarity':
      return 'result';
  }
}

function collectionForStep(step: OnboardingStep): CashClarityCollection | undefined {
  switch (step) {
    case 'now':
      return 'accounts';
    case 'next':
      return 'income';
    case 'protect':
      return 'commitment';
    case 'reserve':
      return 'budget';
    default:
      return undefined;
  }
}

function errorCodeForStep(
  step: OnboardingStep,
  code?: CashClarityPublicationError['code'],
): OnboardingErrorCode {
  if (code === 'missing_spendable_account') return 'missing_spendable_account';
  if (step === 'next') return 'income_invalid';
  if (step === 'protect') return 'payment_invalid';
  if (step === 'reserve') return 'budget_invalid';
  return 'amount_invalid';
}

function publicationMessage(code: CashClarityPublicationError['code']): string {
  switch (code) {
    case 'invalid_input':
      return copy.publishInvalid;
    case 'missing_spendable_account':
      return copy.publishMissingAccount;
    case 'ambiguous_existing_publication':
      return copy.publishAmbiguous;
    case 'incomplete_publication':
      return copy.publishIncomplete;
    case 'finalization_failed':
      return copy.publishFinalization;
    case 'save_failed':
      return copy.publishFailed;
  }
}

export function OnboardingScreen() {
  const privacyAcknowledged = useSyncExternalStore(
    subscribeToPrivacyPolicyAcknowledgement,
    hasAcknowledgedCurrentPrivacyPolicy,
    hasAcknowledgedCurrentPrivacyPolicy,
  );
  const params = useLocalSearchParams<{
    journey?: string | string[];
    context?: string | string[];
    entryPolicy?: string | string[];
    name?: string | string[];
  }>();
  const nameParam = firstParam(params.name);
  const creationLaunch = useCreationLaunch();
  const entry = useMemo(
    () => requestedEntry(params, creationLaunch.entry),
    [params, creationLaunch.entry],
  );
  const [bootstrap] = useState(() => bootstrapSession(entry, nameParam));
  const [session, setSession] = useState<CashClaritySetupDraft | null>(
    bootstrap.kind === 'session' ? bootstrap.session : null,
  );
  const sessionRef = useRef(session);
  const [resumed, setResumed] = useState(bootstrap.kind === 'session' && bootstrap.resumed);
  const [resumePrompt, setResumePrompt] = useState(
    bootstrap.kind === 'session' && bootstrap.resumed && !bootstrap.session.publication,
  );
  const [conflict, setConflict] = useState<SetupDraft | null>(
    bootstrap.kind === 'conflict' ? bootstrap.existing : null,
  );
  const [unreadable, setUnreadable] = useState(bootstrap.kind === 'unreadable');
  const [pendingRestore, setPendingRestore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [repairMessage, setRepairMessage] = useState<string | null>(null);
  const [heard, setHeard] = useState<string | null>(null);
  const [latestDraftChange, setLatestDraftChange] = useState<string | null>(null);
  const [mountedAt] = useState(Date.now);
  const segmentStartedAt = useRef(mountedAt);
  const stepStartedAt = useRef({ step: session?.step, at: mountedAt });
  const draftFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftFeedbackEditStep = useRef<OnboardingStep | null>(null);
  const draftFeedbackVersion = useRef(0);
  const acknowledgedDraft = useRef<CashClaritySetupDraft['draft'] | null>(null);
  const { openCreatedWorkplace } = creationLaunch;
  const locale = session?.inputLocale ?? getLocales()[0]?.languageTag ?? 'en-US';

  useEffect(() => {
    if (bootstrap.kind === 'session' && !bootstrap.resumed) saveSetupDraft(bootstrap.session);
  }, [bootstrap]);

  const persistSession = useCallback(
    (update: (current: CashClaritySetupDraft) => CashClaritySetupDraft) => {
      const current = sessionRef.current;
      if (!current) return;
      const next = update(current);
      if (next.step !== current.step) {
        if (draftFeedbackTimer.current !== null) clearTimeout(draftFeedbackTimer.current);
        draftFeedbackTimer.current = null;
        draftFeedbackEditStep.current = null;
        draftFeedbackVersion.current += 1;
        acknowledgedDraft.current = null;
        setLatestDraftChange(null);
      }
      sessionRef.current = next;
      saveSetupDraft(next);
      setSession(next);
    },
    [],
  );

  const sessionDraft = session?.draft;
  const editableInput = session?.editableInput;
  const prepared = useMemo(
    () =>
      sessionDraft && editableInput
        ? prepareCashClarityInput(sessionDraft, editableInput, locale)
        : undefined,
    [sessionDraft, editableInput, locale],
  );
  const projection = useMemo(
    () => (prepared ? projectCashClarityDraft(prepared.effectiveDraft) : undefined),
    [prepared],
  );
  const spendable = prepared ? hasSpendableAccount(prepared.effectiveDraft.accounts) : false;

  useEffect(() => {
    if (!session || resumePrompt) return;
    if (stepStartedAt.current.step !== session.step) {
      stepStartedAt.current = { step: session.step, at: Date.now() };
    }
    const analyticsProps = {
      flowVersion: FLOW_VERSION,
      intent: session.intent,
      context: session.context,
      resumed,
    } as const;
    if (!startedInRuntime.has(session.operationId)) {
      if (resumed) trackOnboardingFlowResumed(analyticsProps);
      else trackOnboardingFlowStarted(analyticsProps);
      startedInRuntime.add(session.operationId);
    }
    const stepKey = `${session.operationId}:${session.step}`;
    if (!viewedInRuntime.has(stepKey)) {
      trackOnboardingStepViewed({
        ...analyticsProps,
        step: analyticsStep(session.step),
        durationMs: Date.now() - segmentStartedAt.current,
      });
      viewedInRuntime.add(stepKey);
    }
    if (prepared?.hasUsableEstimate && !estimateViewedInRuntime.has(session.operationId)) {
      trackOnboardingFirstEstimate({
        ...analyticsProps,
        durationMs: Date.now() - segmentStartedAt.current,
      });
      estimateViewedInRuntime.add(session.operationId);
    }
    if (session.step === 'clarity' && !resultViewedInRuntime.has(session.operationId) && prepared) {
      const outcome = !prepared.hasUsableEstimate
        ? 'unknown'
        : projection?.safeToSpend === 0
          ? 'zero'
          : (projection?.safeToSpend ?? 0) < 0
            ? 'negative'
            : 'positive';
      trackOnboardingResultViewed({
        ...analyticsProps,
        outcome,
        durationMs: Date.now() - segmentStartedAt.current,
      });
      resultViewedInRuntime.add(session.operationId);
    }
  }, [session, resumed, prepared, projection, resumePrompt]);

  useEffect(() => {
    const activeSession = sessionRef.current;
    if (!activeSession || !acknowledgedDraft.current) return;
    const currentDraft = prepared?.effectiveDraft;
    if (!currentDraft) return;
    const previous = acknowledgedDraft.current;
    if (draftFeedbackEditStep.current !== activeSession.step) {
      acknowledgedDraft.current = currentDraft;
      return;
    }
    const operationId = activeSession.operationId;
    const step = activeSession.step;
    const version = draftFeedbackVersion.current;
    const timer = setTimeout(() => {
      draftFeedbackTimer.current = null;
      const latestSession = sessionRef.current;
      if (
        latestSession?.operationId !== operationId ||
        latestSession.step !== step ||
        draftFeedbackVersion.current !== version
      )
        return;
      setLatestDraftChange(explainDraftTransition(previous, currentDraft));
      acknowledgedDraft.current = currentDraft;
      draftFeedbackEditStep.current = null;
    }, 600);
    draftFeedbackTimer.current = timer;
    return () => {
      clearTimeout(timer);
      if (draftFeedbackTimer.current === timer) draftFeedbackTimer.current = null;
    };
  }, [prepared?.effectiveDraft]);

  useEffect(() => {
    if (prepared && session && !acknowledgedDraft.current)
      acknowledgedDraft.current = prepared.effectiveDraft;
  }, [prepared, session]);

  const updateDraft = (
    update: (current: CashClaritySetupDraft['draft']) => CashClaritySetupDraft['draft'],
  ) => {
    draftFeedbackEditStep.current = sessionRef.current?.step ?? null;
    draftFeedbackVersion.current += 1;
    persistSession(current => ({ ...current, draft: update(current.draft) }));
    setRepairMessage(null);
    setHeard(null);
    setLatestDraftChange(null);
  };

  const updateAmountText = (key: string, raw: string | undefined) => {
    draftFeedbackEditStep.current = sessionRef.current?.step ?? null;
    draftFeedbackVersion.current += 1;
    persistSession(current => {
      const amountTextById = { ...current.editableInput.amountTextById };
      if (raw === undefined) delete amountTextById[key];
      else amountTextById[key] = raw;
      return { ...current, editableInput: { ...current.editableInput, amountTextById } };
    });
    setRepairMessage(null);
    setHeard(null);
    setLatestDraftChange(null);
  };

  const setCollectionDeferred = (collection: CashClarityCollection, value: boolean) => {
    draftFeedbackEditStep.current = sessionRef.current?.step ?? null;
    draftFeedbackVersion.current += 1;
    persistSession(current => {
      const deferredCollections = { ...current.editableInput.deferredCollections };
      if (value) deferredCollections[collection] = true;
      else delete deferredCollections[collection];
      return { ...current, editableInput: { ...current.editableInput, deferredCollections } };
    });
    setRepairMessage(null);
  };

  const saveTransition = (step: OnboardingStep, history: readonly OnboardingStep[]) => {
    persistSession(current => ({ ...current, step, history }));
    setLatestDraftChange(null);
    setHeard(null);
  };

  const trackValidationBlocked = (step: OnboardingStep, errorCode: OnboardingErrorCode) => {
    const current = sessionRef.current;
    if (!current) return;
    const key = `${current.operationId}:${step}:${errorCode}`;
    if (blockedInRuntime.has(key)) return;
    trackOnboardingValidationBlocked({
      flowVersion: FLOW_VERSION,
      intent: current.intent,
      context: current.context,
      resumed,
      step: analyticsStep(step),
      errorCode,
    });
    blockedInRuntime.add(key);
  };

  const advance = (
    next: OnboardingStep,
    echo?: string,
    action: 'continue' | 'defer' = 'continue',
  ) => {
    const current = sessionRef.current;
    if (!current) return;
    const collection = collectionForStep(current.step);
    const currentPrepared = prepareCashClarityInput(current.draft, current.editableInput, locale);
    const issues = collection
      ? currentPrepared.issues.filter(issue => issue.collection === collection)
      : [];
    if (action === 'continue' && issues.length > 0) {
      const dependencyIssue = issues.find(issue => issue.reason === 'dependency');
      trackValidationBlocked(
        current.step,
        errorCodeForStep(current.step, dependencyIssue ? 'missing_spendable_account' : undefined),
      );
      setRepairMessage(issues[0].message);
      if (dependencyIssue && current.step !== 'now') {
        persistSession(value => ({
          ...value,
          repairReturnStep: current.step,
        }));
        setRepairMessage(copy.accountRepairMessage);
      }
      return;
    }
    if (
      action === 'continue' &&
      current.step === 'now' &&
      current.repairReturnStep &&
      !currentPrepared.hasUsableEstimate
    ) {
      setRepairMessage(copy.accountRepairMessage);
      return;
    }
    const completionKey = `${current.step}:${action === 'defer' ? 'defer' : current.step === 'clarity' ? 'complete' : 'continue'}`;
    const shouldTrackCompletion = !current.completedActions.includes(completionKey);
    if (shouldTrackCompletion) {
      persistSession(value => ({
        ...value,
        completedActions: [...value.completedActions, completionKey],
      }));
      const props = {
        flowVersion: FLOW_VERSION,
        intent: current.intent,
        context: current.context,
        resumed,
        step: analyticsStep(current.step),
        durationMs: Date.now() - stepStartedAt.current.at,
      } as const;
      if (action === 'defer') trackOnboardingStepDeferred({ ...props, action: 'defer' });
      else
        trackOnboardingStepCompleted({
          ...props,
          action: current.step === 'clarity' ? 'complete' : 'continue',
        });
    }
    const repairTarget = current.repairReturnStep;
    const shouldReturnFromRepair =
      current.step === 'now' &&
      repairTarget !== undefined &&
      (currentPrepared.hasUsableEstimate || action === 'defer') &&
      repairTarget !== 'now';
    const shouldReturnFromReview =
      current.step !== 'clarity' && current.history.at(-1) === 'clarity';
    const actualNext =
      shouldReturnFromRepair && repairTarget
        ? repairTarget
        : shouldReturnFromReview
          ? 'clarity'
          : current.step === 'now' && next === 'now'
            ? 'next'
            : next;
    const history =
      shouldReturnFromRepair || shouldReturnFromReview
        ? current.history.slice(0, -1)
        : actualNext === current.step
          ? current.history
          : [...current.history, current.step];
    persistSession(value => ({
      ...value,
      step: actualNext,
      history,
      ...((current.step === 'now' || current.step === repairTarget) &&
      (currentPrepared.hasUsableEstimate || action === 'defer')
        ? { repairReturnStep: undefined }
        : {}),
    }));
    setHeard(echo ?? null);
    setRepairMessage(null);
    setLatestDraftChange(null);
  };

  const continueCollection = (
    collection: CashClarityCollection,
    next: OnboardingStep,
    echo: string,
  ) => {
    // Collectors can persist defer/include and continue synchronously from one press.
    const latest = sessionRef.current;
    const action = latest?.editableInput.deferredCollections?.[collection] ? 'defer' : 'continue';
    advance(next, echo, action);
  };

  const back = () => {
    const current = sessionRef.current;
    if (!current || current.publication) return;
    setHeard(null);
    setLatestDraftChange(null);
    const previous = current.history[current.history.length - 1];
    if (previous) {
      persistSession(value => ({ ...value, step: previous, history: value.history.slice(0, -1) }));
    } else if (current.context === 'registered_empty_device' || current.intent === 'first_run') {
      return;
    } else {
      // The optional entry route owns return-to-origin navigation; the durable session remains saved.
      AppNavigation.back();
    }
  };

  const needAccount = () => {
    const current = sessionRef.current;
    if (!current) return;
    persistSession(value => ({
      ...value,
      repairReturnStep: current.step,
    }));
    setRepairMessage(copy.accountRepairMessage);
  };

  const openSpendableAccountStep = () => {
    const current = sessionRef.current;
    if (!current || current.step === 'now') return;
    persistSession(value => ({
      ...value,
      repairReturnStep: current.step,
      step: 'now',
      history: [...value.history, value.step],
    }));
    setRepairMessage(copy.accountRepairMessage);
  };

  const setCardPaymentsDeferred = (value: boolean) => {
    persistSession(current => ({
      ...current,
      editableInput: {
        ...current.editableInput,
        ...(value ? { deferredCardPayments: true } : { deferredCardPayments: undefined }),
      },
    }));
    setRepairMessage(null);
  };

  const deferAffectedGroups = () => {
    const current = sessionRef.current;
    if (!current) return;
    const deferral = spendableDeferral(
      prepareCashClarityInput(current.draft, current.editableInput, locale).issues,
    );
    if (deferral.collections.length === 0 && !deferral.cardPayments) return;
    persistSession(value => {
      const deferredCollections = { ...value.editableInput.deferredCollections };
      for (const collection of deferral.collections) deferredCollections[collection] = true;
      return {
        ...value,
        editableInput: {
          ...value.editableInput,
          deferredCollections,
          ...(deferral.cardPayments ? { deferredCardPayments: true } : {}),
        },
        repairReturnStep: undefined,
      };
    });
    setRepairMessage(null);
  };

  const startRestore = () => setPendingRestore(true);

  const discardAndBeginRequested = () => {
    const existing = conflict;
    if (existing?.kind === 'cash_clarity' && existing.publication) return;
    if (existing?.kind === 'cash_clarity') {
      trackOnboardingFlowRestarted({
        flowVersion: FLOW_VERSION,
        intent: existing.intent,
        context: existing.context,
        resumed: false,
      });
    }
    if (existing) clearSetupDraft();
    if (unreadable) discardUnreadableSetupDraft();
    if (draftFeedbackTimer.current !== null) clearTimeout(draftFeedbackTimer.current);
    draftFeedbackTimer.current = null;
    draftFeedbackEditStep.current = null;
    draftFeedbackVersion.current += 1;
    setLatestDraftChange(null);
    const name = firstParam(params.name);
    const next = createCreationSession({
      ...entry,
      currency: defaultOnboardingCurrency(),
      workplaceName: defaultWorkplaceName(),
      displayName: entry.intent === 'first_run' ? (name ?? '') : (preferences.userName ?? ''),
    });
    saveSetupDraft(next);
    acknowledgedDraft.current = null;
    segmentStartedAt.current = Date.now();
    sessionRef.current = next;
    setSession(next);
    setConflict(null);
    setUnreadable(false);
    setResumed(false);
    setPendingRestore(false);
  };

  const resumeConflict = () => {
    if (!conflict) return;
    if (conflict.kind === 'cash_clarity') {
      sessionRef.current = conflict;
      setSession(conflict);
      setConflict(null);
      setUnreadable(false);
      setResumePrompt(false);
      setResumed(true);
      return;
    }
    AppNavigation.toSetupJourney(conflict.journeyId);
  };

  const restartSession = () => {
    const current = sessionRef.current;
    if (current?.publication) return;
    if (current) {
      trackOnboardingFlowRestarted({
        flowVersion: FLOW_VERSION,
        intent: current.intent,
        context: current.context,
        resumed: true,
      });
    }
    clearPendingCashClarityWorkplaceId();
    if (draftFeedbackTimer.current !== null) clearTimeout(draftFeedbackTimer.current);
    draftFeedbackTimer.current = null;
    draftFeedbackEditStep.current = null;
    draftFeedbackVersion.current += 1;
    clearSetupDraft();
    const next = createCreationSession({
      ...entry,
      currency: defaultOnboardingCurrency(),
      workplaceName: defaultWorkplaceName(),
      displayName:
        entry.intent === 'first_run'
          ? (firstParam(params.name) ?? '')
          : (preferences.userName ?? ''),
    });
    segmentStartedAt.current = Date.now();
    acknowledgedDraft.current = null;
    stepStartedAt.current = { step: next.step, at: Date.now() };
    sessionRef.current = next;
    saveSetupDraft(next);
    setSession(next);
    setResumePrompt(false);
    setResumed(false);
    setFinishError(null);
  };

  const resumeSession = () => {
    const now = Date.now();
    segmentStartedAt.current = now;
    if (sessionRef.current) stepStartedAt.current = { step: sessionRef.current.step, at: now };
    setResumePrompt(false);
    setResumed(true);
  };

  const beginRestoreAfterDiscard = () => {
    const current = sessionRef.current;
    if (current?.publication) return;
    clearSetupDraft();
    if (current) {
      trackOnboardingFlowRestarted({
        flowVersion: FLOW_VERSION,
        intent: current.intent,
        context: current.context,
        resumed: false,
      });
    }
    setPendingRestore(false);
    sessionRef.current = null;
    setSession(null);
    if (entry.intent === 'first_run') {
      startFirstRunRestoreFromDeviceName(current?.draft.displayName.trim() ?? '');
      AppNavigation.toSetupJourney('first_run_restore');
    } else {
      const restoreJourney =
        entry.context === 'registered_empty_device'
          ? 'empty_device_restore'
          : entry.context === 'existing_workplace_entry'
            ? 'settings_restore'
            : 'picker_restore';
      AppNavigation.toSetupJourney(restoreJourney);
    }
  };

  const openPublished = async (current: CashClaritySetupDraft) => {
    const published = current.publication;
    if (!published) return;
    await recoverCashClarityPublication(published.workplaceId);
    if (current.intent === 'first_run') {
      finishDeviceSetup({
        displayName: { value: current.draft.displayName.trim(), source: 'user_entered' },
      });
    }
    await openCreatedWorkplace(published.workplaceId);
    const props = {
      flowVersion: FLOW_VERSION,
      intent: current.intent,
      context: current.context,
      resumed,
    } as const;
    if (!openedInRuntime.has(current.operationId)) {
      trackOnboardingDashboardOpened({
        ...props,
        outcome: 'opened',
        durationMs: Date.now() - segmentStartedAt.current,
      });
      if (current.intent === 'first_run') {
        analytics.track('onboarding_complete');
        analytics.trackConversion('onboarding_completed');
      }
      openedInRuntime.add(current.operationId);
    }
    clearPendingCashClarityWorkplaceId();
    clearSetupDraft();
    sessionRef.current = null;
    setSession(null);
    triggerSaveOutcomeHaptic(true);
  };

  const finish = async () => {
    const current = sessionRef.current;
    if (!current || busy) return;
    if (draftFeedbackTimer.current !== null) clearTimeout(draftFeedbackTimer.current);
    draftFeedbackTimer.current = null;
    draftFeedbackEditStep.current = null;
    draftFeedbackVersion.current += 1;
    setLatestDraftChange(null);
    setFinishError(null);
    setBusy(true);
    const startedAt = Date.now();
    const analyticsProps = {
      flowVersion: FLOW_VERSION,
      intent: current.intent,
      context: current.context,
      resumed,
    } as const;
    try {
      if (current.publication) {
        await openPublished(current);
        trackOnboardingSaveResult({
          ...analyticsProps,
          outcome: 'success',
          durationMs: Date.now() - startedAt,
        });
        return;
      }
      if (current.intent === 'first_run' && !current.draft.displayName.trim()) {
        setFinishError(copy.requiredName);
        trackOnboardingSaveResult({
          ...analyticsProps,
          outcome: 'failure',
          errorCode: 'required_field_missing',
        });
        return;
      }
      const currentPrepared = prepareCashClarityInput(current.draft, current.editableInput, locale);
      if (!currentPrepared.isValid) {
        setFinishError(currentPrepared.issues[0]?.message ?? copy.publishInvalid);
        trackOnboardingSaveResult({
          ...analyticsProps,
          outcome: 'failure',
          errorCode: 'amount_invalid',
        });
        return;
      }
      const published = await publishCashClarity(currentPrepared.effectiveDraft, {
        preserveWorkplaceName: current.legacyProvenance !== undefined,
      });
      const recoverableSession = { ...current };
      delete recoverableSession.publicationErrorCode;
      const withPublication = {
        ...recoverableSession,
        publication: published,
      } satisfies CashClaritySetupDraft;
      sessionRef.current = withPublication;
      saveSetupDraft(withPublication);
      setSession(withPublication);
      await openPublished(withPublication);
      trackOnboardingSaveResult({
        ...analyticsProps,
        outcome: 'success',
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      triggerSaveOutcomeHaptic(false);
      const code = error instanceof CashClarityPublicationError ? error.code : undefined;
      logger.error('[Onboarding] Failed to finish setup', { code: code ?? 'unknown' });
      const publicationExists = sessionRef.current?.publication !== undefined;
      if (code) {
        persistSession(value => ({ ...value, publicationErrorCode: code }));
        setFinishError(publicationMessage(code));
      } else if (publicationExists) {
        setFinishError(copy.openFailed);
      } else {
        setFinishError(copy.publishFailed);
      }
      trackOnboardingSaveResult({
        ...analyticsProps,
        outcome: publicationExists ? 'saved' : 'failure',
        errorCode: publicationExists
          ? 'open_failed'
          : code === 'missing_spendable_account'
            ? 'missing_spendable_account'
            : 'save_failed',
        durationMs: Date.now() - startedAt,
      });
    } finally {
      setBusy(false);
    }
  };

  const acknowledgePrivacy = () => {
    acknowledgeCurrentPrivacyPolicy();
    analytics.track('privacy_policy_acknowledged', {
      policy_version: AppConfig.legal.privacyPolicyVersion,
    });
  };

  if (unreadable) {
    return (
      <OnboardingChrome testID="onboarding-screen" stage={null}>
        <ConversationStep
          title={copy.unreadableDraftTitle}
          onBack={() => AppNavigation.back()}
          primaryLabel={copy.startOver}
          onPrimary={discardAndBeginRequested}
        >
          <AppText variant="body" color="secondary">
            {copy.unreadableDraftBody}
          </AppText>
        </ConversationStep>
      </OnboardingChrome>
    );
  }

  if (conflict) {
    const publishedCreation = conflict.kind === 'cash_clarity' && conflict.publication;
    return (
      <OnboardingChrome testID="onboarding-screen" stage={null}>
        <ConversationStep
          title={copy.sessionConflictTitle}
          onBack={() => AppNavigation.back()}
          primaryLabel={publishedCreation ? copy.retryOpen : copy.resumeSetup}
          onPrimary={
            publishedCreation
              ? () => {
                  if (conflict.kind !== 'cash_clarity' || !conflict.publication) return;
                  sessionRef.current = conflict;
                  setSession(conflict);
                  setConflict(null);
                  void finish();
                }
              : resumeConflict
          }
          skipLabel={publishedCreation ? undefined : copy.discardAndContinue}
          onSkip={publishedCreation ? undefined : discardAndBeginRequested}
        >
          <AppText variant="body" color="secondary">
            {copy.sessionConflictBody}
          </AppText>
        </ConversationStep>
      </OnboardingChrome>
    );
  }

  if (pendingRestore) {
    return (
      <OnboardingChrome testID="onboarding-screen" stage={null}>
        <ConversationStep
          title={copy.sessionConflictTitle}
          onBack={() => setPendingRestore(false)}
          primaryLabel={copy.resumeSetup}
          onPrimary={() => setPendingRestore(false)}
          skipLabel={copy.discardAndContinue}
          onSkip={beginRestoreAfterDiscard}
        >
          <AppText variant="body" color="secondary">
            {copy.sessionConflictBody}
          </AppText>
        </ConversationStep>
      </OnboardingChrome>
    );
  }

  if (resumePrompt && session && prepared && projection) {
    return (
      <OnboardingChrome testID="onboarding-screen" stage={null}>
        <ConversationStep
          title={copy.resumeSessionTitle}
          subtitle={copy.resumeSessionBody}
          onBack={() => AppNavigation.back()}
          primaryLabel={copy.resumeSetup}
          onPrimary={resumeSession}
          skipLabel={copy.startOver}
          onSkip={restartSession}
          centerContent
          secondaryActionsDirection="row"
        >
          <ResumeSetupSummary session={session} prepared={prepared} projection={projection} />
        </ConversationStep>
      </OnboardingChrome>
    );
  }

  if (!session || !prepared || !projection) return <LoadingView loading text={copy.finishing} />;

  const step = session.step;
  const showSafeToSpend =
    step === 'now' || step === 'next' || step === 'protect' || step === 'reserve';
  const collection = collectionForStep(step);
  const spendableIssues = spendableDependencyIssues(prepared.issues);
  const spendableLabels = [
    spendableIssues.some(issue => issue.collection === 'income')
      ? copy.resumeIncomeLabel
      : undefined,
    spendableIssues.some(issue => issue.collection === 'commitment')
      ? copy.resumePaymentsLabel
      : undefined,
    spendableIssues.some(issue => issue.collection === 'budget')
      ? copy.resumeLimitsLabel
      : undefined,
    spendableIssues.some(issue => issue.collection === 'accounts')
      ? copy.cardPaymentsLabel
      : undefined,
  ].filter(label => label !== undefined);
  const spendableMessage =
    spendableLabels.length > 0 ? copy.affectedSpendableGroups(spendableLabels.join(', ')) : null;
  const spendableWork = spendableDeferral(spendableIssues);
  const showAddSpendableAccount = step !== 'now' && spendableIssues.length > 0;
  const showLeaveSpendableGroups =
    spendableWork.collections.length > 0 || spendableWork.cardPayments;
  const spendableRecovery =
    showAddSpendableAccount || showLeaveSpendableGroups ? (
      <Stack gap="xs">
        {showAddSpendableAccount ? (
          <AppButton variant="secondary" size="md" onPress={openSpendableAccountStep}>
            {copy.addSpendableAccount}
          </AppButton>
        ) : null}
        {showLeaveSpendableGroups ? (
          <AppButton variant="ghost" size="md" onPress={deferAffectedGroups}>
            {copy.leaveForLater}
          </AppButton>
        ) : null}
      </Stack>
    ) : undefined;
  const collectorHooks: CollectorSessionHooks = {
    editableInput: session.editableInput,
    locale,
    onAmountTextChange: updateAmountText,
    onDefer: () => {
      if (collection) setCollectionDeferred(collection, true);
    },
    onInclude: () => {
      if (collection) setCollectionDeferred(collection, false);
    },
    continueLabel:
      session.history.at(-1) === 'clarity' || (step === 'now' && session.repairReturnStep)
        ? copy.continue
        : undefined,
    validationMessage:
      step === 'now' || step === 'next' || step === 'protect' || step === 'reserve'
        ? (repairMessage ?? spendableMessage)
        : null,
    recovery: spendableRecovery,
    onValidationBlocked: reason => {
      const currentStep = sessionRef.current?.step;
      if (currentStep) trackValidationBlocked(currentStep, reason);
    },
  };

  const cardPaymentDetail = session.draft.accounts
    .filter(account => account.kind === 'card' && (account.cardPaymentAmount ?? 0) > 0)
    .map(account => account.name)
    .filter(Boolean)
    .join(', ');
  const deferredOmissions = [
    ...prepared.deferredCollections.map(collection => {
      const detail =
        collection === 'accounts'
          ? session.draft.accounts
              .map(item => item.name)
              .filter(Boolean)
              .join(', ')
          : collection === 'income'
            ? session.draft.income.kind === 'recurring'
              ? session.draft.income.items
                  .map(item => item.name)
                  .filter(Boolean)
                  .join(', ')
              : ''
            : collection === 'commitment'
              ? session.draft.commitment.kind === 'payment'
                ? session.draft.commitment.items
                    .map(item => item.name)
                    .filter(Boolean)
                    .join(', ')
                : ''
              : session.draft.budget.kind === 'set'
                ? session.draft.budget.items
                    .map(item => item.name)
                    .filter(Boolean)
                    .join(', ')
                : '';
      return {
        id: collection,
        label:
          collection === 'accounts'
            ? copy.stageNow
            : collection === 'income'
              ? copy.expectedIncome
              : collection === 'commitment'
                ? copy.upcomingPayments
                : copy.stageReserve,
        ...(detail ? { detail } : {}),
      };
    }),
    ...(session.editableInput.deferredCardPayments
      ? [
          {
            id: 'card-payments',
            label: copy.cardPaymentsLabel,
            ...(cardPaymentDetail ? { detail: cardPaymentDetail } : {}),
          },
        ]
      : []),
  ];
  const editActions = [
    {
      id: 'accounts',
      label: copy.editAccounts,
      onPress: () => saveTransition('now', [...session.history, 'clarity']),
    },
    {
      id: 'income',
      label: copy.editIncome,
      onPress: () => saveTransition('next', [...session.history, 'clarity']),
    },
    {
      id: 'payments',
      label: copy.editPayments,
      onPress: () => saveTransition('protect', [...session.history, 'clarity']),
    },
    {
      id: 'budget',
      label: copy.editBudgets,
      onPress: () => saveTransition('reserve', [...session.history, 'clarity']),
    },
  ];

  const scene =
    busy && step !== 'clarity' ? (
      <LoadingView loading text={copy.finishing} />
    ) : step === 'welcome' ? (
      <WelcomeScene
        name={session.draft.displayName}
        onNameChange={displayName => updateDraft(current => ({ ...current, displayName }))}
        privacyAcknowledged={privacyAcknowledged}
        onAcknowledgePrivacy={acknowledgePrivacy}
        onPrivacyNotice={() => AppNavigation.toPrivacyNotice()}
        onStart={() => {
          if (!session.draft.displayName.trim()) return;
          advance('currency', undefined);
        }}
        onRestore={startRestore}
      />
    ) : step === 'currency' ? (
      <Stack flex={1} minHeight={0} gap="md">
        <CurrencyScene
          currency={session.draft.currency}
          onSelectCurrency={currency => updateDraft(current => ({ ...current, currency }))}
          onContinue={() =>
            advance(
              'now',
              session.draft.displayName.trim()
                ? copy.confirmYou(session.draft.displayName.trim())
                : undefined,
            )
          }
          onBack={back}
        />
        {session.context === 'registered_empty_device' ? (
          <AppButton variant="ghost" size="md" onPress={startRestore}>
            {copy.restoreBackup}
          </AppButton>
        ) : null}
      </Stack>
    ) : step === 'now' ? (
      <MoneyScene
        currency={session.draft.currency}
        accounts={session.draft.accounts}
        onAccountsChange={accounts => updateDraft(current => ({ ...current, accounts }))}
        onContinue={echo =>
          continueCollection('accounts', sessionRef.current?.repairReturnStep ?? 'next', echo)
        }
        onSkip={() => undefined}
        onBack={back}
        onNeedAccount={needAccount}
        onIncludeCardPayments={() => setCardPaymentsDeferred(false)}
        {...collectorHooks}
      />
    ) : step === 'next' ? (
      <IncomeScene
        currency={session.draft.currency}
        income={session.draft.income}
        onIncomeChange={income => updateDraft(current => ({ ...current, income }))}
        onContinue={echo => continueCollection('income', 'protect', echo)}
        onBack={back}
        hasSpendable={spendable}
        onNeedAccount={needAccount}
        {...collectorHooks}
      />
    ) : step === 'protect' ? (
      <ProtectScene
        currency={session.draft.currency}
        commitment={session.draft.commitment}
        onCommitmentChange={commitment => updateDraft(current => ({ ...current, commitment }))}
        onContinue={echo => continueCollection('commitment', 'reserve', echo)}
        onBack={back}
        hasSpendable={spendable}
        onNeedAccount={needAccount}
        {...collectorHooks}
      />
    ) : step === 'reserve' ? (
      <ReserveScene
        currency={session.draft.currency}
        budget={session.draft.budget}
        onBudgetChange={budget => updateDraft(current => ({ ...current, budget }))}
        onContinue={echo => continueCollection('budget', 'clarity', echo)}
        onBack={back}
        hasSpendable={spendable}
        onNeedAccount={needAccount}
        {...collectorHooks}
      />
    ) : (
      <ClarityScene
        currency={session.draft.currency}
        draft={prepared.effectiveDraft}
        projection={projection}
        hasUsableEstimate={prepared.hasUsableEstimate}
        isIncompleteEstimate={prepared.isIncomplete}
        finishing={busy}
        finishError={
          session.publication
            ? null
            : (finishError ??
              (session.publicationErrorCode
                ? publicationMessage(session.publicationErrorCode)
                : null))
        }
        publishedOutcome={
          session.publication
            ? {
                retryOpen: () => void finish(),
                error:
                  finishError ??
                  (session.publicationErrorCode
                    ? publicationMessage(session.publicationErrorCode)
                    : null),
              }
            : undefined
        }
        omissions={deferredOmissions}
        editActions={editActions}
        recovery={spendableRecovery}
        dependencyMessage={finishError ? null : spendableMessage}
        onEnter={() => void finish()}
        onBack={back}
      />
    );

  const gatedScene =
    !privacyAcknowledged && step !== 'welcome' ? (
      <ConversationStep
        title={copy.privacyBeforeSetup}
        onBack={back}
        primaryLabel={copy.continue}
        onPrimary={() => undefined}
      >
        <AppText variant="body" color="secondary">
          {copy.privacyFootnote}
        </AppText>
      </ConversationStep>
    ) : (
      scene
    );

  return (
    <>
      <OnboardingChrome
        testID="onboarding-screen"
        stage={onboardingStage(step)}
        header={
          showSafeToSpend ? (
            <SafeToSpendHeader
              amount={projection.safeToSpend}
              currency={session.draft.currency}
              change={latestDraftChange}
              spokenEcho={heard}
              hasUsableEstimate={prepared.hasUsableEstimate}
              isIncompleteEstimate={prepared.isIncomplete}
            />
          ) : null
        }
      >
        <Box flex={1} minHeight={0}>
          {gatedScene}
        </Box>
      </OnboardingChrome>
      {!privacyAcknowledged && step !== 'welcome' ? (
        <PrivacyAcknowledgementSheet
          visible
          onClose={() => undefined}
          onOpenFullPolicy={() => AppNavigation.toPrivacyNotice()}
          onAcknowledge={acknowledgePrivacy}
        />
      ) : null}
    </>
  );
}
