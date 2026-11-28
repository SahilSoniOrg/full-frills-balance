import { useAccounts, type CreateAccountIntent } from '@/src/components/account-selection';
import { AppConfig } from '@/src/constants';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import type { AccountFields, PlainInboxRecord } from '@/src/types/plainDtos';
import type { JournalSuggestion } from '@/src/types/journalSuggestions';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import {
  JournalEntryAccountPickerRequestOptions,
  useJournalEntryAccountPicker,
  type JournalAccountCreateTarget,
} from '@/src/features/journal/entry/hooks/useJournalEntryAccountPicker';
import { applyJournalLineAccountSelection } from '@/src/features/journal/entry/journalEntryAccountPickerPolicy';
import type { AutopilotAppliedAccount } from '@/src/features/journal/entry/components/useSimpleFormExpansion';
import {
  JournalEntryScreenMode,
  parseTransactionIntentSeed,
  resolveJournalEntryHeaderTitle,
} from '@/src/features/journal/entry/journalEntryPresentation';
import { useJournalEntryModeState } from '@/src/features/journal/entry/hooks/useJournalEntryModeState';
import {
  createJournalDraftFingerprint,
  useJournalEntryLeaveGuard,
} from '@/src/features/journal/entry/hooks/useJournalEntryLeaveGuard';
import { useTransactionComposerSession } from '@/src/features/journal/entry/hooks/useTransactionComposerSession';
import { useBatchJournalSession } from '@/src/features/journal/entry/hooks/useBatchJournalSession';
import type { useBulkJournalEditor } from '@/src/features/journal/entry/hooks/useBulkJournalEditor';
import type { SavedJournalSummary } from '@/src/features/journal/entry/types/bulkJournal';
import { applyJournalSuggestion } from '@/src/features/journal/entry/hooks/applyJournalSuggestion';
import {
  JournalSuggestionState,
  JournalSuggestionPage,
  useJournalSuggestions,
} from '@/src/features/journal/hooks/useJournalSuggestions';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { AccountType, JournalStatus, TransactionType } from '@/src/types/enums';
import { SPLIT_SOURCE_LINE_ID } from '@/src/services/journal/splitJournalHelpers';
import { useBoundWorkplaceSaveGate } from '@/src/navigation/boundWorkplace';
import { AppNavigation } from '@/src/navigation/AppNavigation';
import { useInboxSourceRecords } from '@/src/features/journal/entry/hooks/useInboxSourceRecords';
import { createPersonWithReceivable, peopleReadService } from '@/src/services/people';
import { logger } from '@/src/services/observability/logger';
import { formatRoundedAmount } from '@/src/domain/money/money';
import { getCurrencyPrecision } from '@/src/domain/money/currencyPrecision';
import type { PersonPickerGroup } from '@/src/components/account-selection/personAccountGrouping';
import type { SplitParticipant } from '@/src/features/journal/entry/components/SplitPeopleParticipantsBar';
import { lineAccountPatch } from '@/src/services/journal/journalEditorHelpers';
import type { OpenItemId, PersonId } from '@/src/types/ids';
import type { TransferOpenItemPlan } from '@/src/features/journal/entry/transferOpenItemPlan';
import { useObservable } from '@/src/hooks/useObservable';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface JournalEntryShell {
  editor: ReturnType<typeof useJournalEditor>;
  guidedAutopilot: boolean;
  splitState: ReturnType<typeof useTransactionComposerSession>['splitState'];
  validationIssues: ReturnType<typeof useTransactionComposerSession>['validationIssues'];
  splitValidation: ReturnType<typeof useTransactionComposerSession>['splitValidation'];
  onSubmit: () => void;
  accounts: ReturnType<typeof useAccounts>['accounts'];
  activeMode: JournalEntryScreenMode;
  onToggleMode: (mode: JournalEntryScreenMode) => void;
  isLoading: boolean;
  loadState: ReturnType<typeof useJournalEditor>['loadState'];
  headerTitle: string;
  showEditBanner: boolean;
  editBannerText: string;
  showAccountPicker: boolean;
  onCloseAccountPicker: () => void;
  onAccountPickerDismiss: () => void;
  onClose: () => void;
  onSelectAccountRequest: (
    lineId: string,
    options?: JournalEntryAccountPickerRequestOptions,
  ) => void;
  onAccountSelected: (accountId: AccountId) => void;
  selectedAccountId?: AccountId;
  selectableAccounts: AccountFields[];
  accountPickerTitle: string;
  isSimpleModeDisabled: boolean;
  isSplitModeDisabled: boolean;
  onCreateAccountRequest: (intent: CreateAccountIntent) => void;
  onCreateAccountForTarget: (
    target: JournalAccountCreateTarget,
    intent: CreateAccountIntent,
  ) => void;
  suggestions: JournalSuggestion[];
  suggestionState: JournalSuggestionState;
  onSelectSuggestion: (suggestion: JournalSuggestion) => AutopilotAppliedAccount | undefined;
  loadSuggestions: () => void;
  workplaceCurrency: string;
  workplaceId: WorkplaceId;
  batchEditor: ReturnType<typeof useBulkJournalEditor>;
  batchSummary: { count: number; items: SavedJournalSummary[] } | null;
  onContinueBatch: () => void;
  onDoneBatch: () => void;
  /** True briefly after a successful save so the CTA can pulse before leave. */
  saveSuccessPulse: boolean;
  inboxItems: PlainInboxRecord[];
  people: SplitParticipant[];
  peopleGroups: PersonPickerGroup[];
  initialPersonId?: PersonId;
  initialOpenItemId?: OpenItemId;
  onQuickAddPerson: (
    name: string,
    currencyCode?: string,
  ) => Promise<{ id: AccountId; name: string }>;
  onTransferOpenItemPlanChange: (plan: TransferOpenItemPlan | null) => void;
}

export function useJournalEntryShell(): JournalEntryShell {
  const params = useLocalSearchParams();
  const seed = parseTransactionIntentSeed(params);
  const { defaultCurrencyCode: workplaceCurrency } = useWorkplace();
  const { workplaceId, assertBound } = useBoundWorkplaceSaveGate();

  const { accounts } = useAccounts(workplaceId);
  const { data: peopleGroups } = useObservable(
    () => peopleReadService.observePersonPickerGroups(workplaceId),
    [workplaceId],
    [],
    { resetKey: workplaceId },
  );
  const people = useMemo(
    () =>
      peopleGroups
        .filter(group => !group.archived)
        .map(group => ({
          id: group.personId,
          name: group.personName,
          icon: group.icon,
          color: group.color,
        })),
    [peopleGroups],
  );
  const transferOpenItemPlanRef = useRef<TransferOpenItemPlan | null>(null);
  const onTransferOpenItemPlanChange = useCallback((plan: TransferOpenItemPlan | null) => {
    transferOpenItemPlanRef.current = plan;
  }, []);
  const onQuickAddPerson = useCallback(
    async (name: string, currencyCode?: string) => {
      const { account } = await createPersonWithReceivable(workplaceId, {
        name,
        currencyCode: currencyCode ?? workplaceCurrency,
      });
      return { id: account.id, name: account.name };
    },
    [workplaceId, workplaceCurrency],
  );

  const leaveAfterSaveRef = useRef<() => void>(() => AppNavigation.back());
  const saveLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transferSeededRef = useRef(false);
  const getRepaymentAllocationRef = useRef<
    () => import('@/src/types/journalWrite').JournalRepaymentAllocation | undefined
  >(() => undefined);
  const reduceMotion = useReducedMotion();
  const [saveSuccessPulse, setSaveSuccessPulse] = useState(false);
  const onSuccess = useCallback(() => {
    if (saveLeaveTimerRef.current) clearTimeout(saveLeaveTimerRef.current);

    if (reduceMotion) {
      setSaveSuccessPulse(false);
      leaveAfterSaveRef.current();
      return;
    }

    setSaveSuccessPulse(true);
    saveLeaveTimerRef.current = setTimeout(() => {
      saveLeaveTimerRef.current = null;
      setSaveSuccessPulse(false);
      leaveAfterSaveRef.current();
    }, AppConfig.timing.saveConfirmMs);
  }, [reduceMotion]);

  useEffect(
    () => () => {
      if (saveLeaveTimerRef.current) clearTimeout(saveLeaveTimerRef.current);
    },
    [],
  );

  const session = useTransactionComposerSession(workplaceId, {
    accounts,
    currencyCode: workplaceCurrency,
    journalId: seed.journalId,
    copyFromJournalId: seed.copyFromJournalId,
    initialMode:
      seed.editorMode === 'bulk' || seed.editorMode === 'split' ? undefined : seed.editorMode,
    initialType: seed.type,
    initialAmount: seed.amount,
    initialCurrencyCode: seed.currencyCode,
    initialDescription: seed.description,
    initialNotes: seed.notes,
    smsId: seed.sourceContext?.smsId,
    smsRecordId: seed.sourceContext?.smsRecordId,
    launchSource: seed.sourceContext?.launchSource,
    initialDate: seed.date,
    initialSourceId: seed.sourceAccountId,
    initialDestinationId: seed.destinationAccountId,
    getRepaymentAllocation: () => getRepaymentAllocationRef.current(),
    onSuccess,
  });
  const { editor, splitState } = session;
  const { lines, updateLines } = editor;

  const inboxItems = useInboxSourceRecords({
    workplaceId,
    smsRecordId: seed.sourceContext?.smsRecordId,
    journalId: seed.journalId,
    isEdit: editor.isEdit,
  });

  const { activeMode, onToggleMode, isSimpleModeDisabled, isSplitModeDisabled } =
    useJournalEntryModeState(editor, seed.editorMode);

  useEffect(() => {
    getRepaymentAllocationRef.current = () => {
      const plan = transferOpenItemPlanRef.current;
      return activeMode === 'basic' &&
        editor.savedStatus !== JournalStatus.POSTED &&
        editor.transactionType === 'transfer' &&
        plan &&
        plan.allocations.length > 0
        ? plan
        : undefined;
    };
  }, [activeMode, editor.savedStatus, editor.transactionType]);

  useEffect(() => {
    if (
      transferSeededRef.current ||
      seed.journalId ||
      seed.type !== 'transfer' ||
      !seed.personId ||
      !accounts.length ||
      !peopleGroups.length
    )
      return;
    transferSeededRef.current = true;
    void peopleReadService
      .getPersonDetail(workplaceId, seed.personId, workplaceCurrency)
      .then(detail => {
        if (!detail) return;
        const linked = detail.linkedAccounts;
        const item = seed.openItemId
          ? detail.openItems.find(row => row.item.id === seed.openItemId)
          : undefined;
        const matchCurrency = item?.item.currencyCode ?? seed.currencyCode?.trim().toUpperCase();
        const byType = (type: AccountType) =>
          linked
            .map(entry => entry.account)
            .find(
              account =>
                account.accountType === type &&
                (!matchCurrency || account.currencyCode === matchCurrency),
            ) ?? linked.map(entry => entry.account).find(account => account.accountType === type);
        const personAccount =
          (item && accounts.find(account => account.id === item.item.accountId)) ||
          byType(AccountType.ASSET) ||
          byType(AccountType.LIABILITY);
        if (!personAccount) return;
        // Seed only the person leg; leave the cash/bank counterparty empty for the user.
        const personAsSource = personAccount.accountType === AccountType.ASSET;
        const personLineType = personAsSource ? TransactionType.CREDIT : TransactionType.DEBIT;
        const personLine = lines.find(line => line.transactionType === personLineType);
        if (!personLine) return;
        const precision = getCurrencyPrecision(personAccount.currencyCode);
        const seededAmount =
          item && !seed.amount && item.remainder > 0
            ? formatRoundedAmount(item.remainder, precision)
            : undefined;
        const counterpartyLine = lines.find(line => line.transactionType !== personLineType);
        updateLines({
          [personLine.id]: {
            ...lineAccountPatch(personAccount.id, personAccount, personAccount.accountType),
            ...(seededAmount ? { amount: seededAmount } : {}),
          },
          ...(seededAmount &&
          counterpartyLine &&
          !counterpartyLine.amount &&
          counterpartyLine.accountCurrency === personAccount.currencyCode
            ? { [counterpartyLine.id]: { amount: seededAmount } }
            : {}),
        });
      })
      .catch(error => logger.warn('Could not load People transfer details', { error }));
  }, [
    accounts,
    lines,
    updateLines,
    peopleGroups,
    seed.amount,
    seed.currencyCode,
    seed.journalId,
    seed.openItemId,
    seed.personId,
    seed.type,
    workplaceCurrency,
    workplaceId,
  ]);

  const {
    batchEditor,
    batchSummary,
    onContinueBatch,
    onDoneBatch: clearBatchAfterSave,
  } = useBatchJournalSession(workplaceId, workplaceCurrency, accounts);
  const { saveAll: saveBatch } = batchEditor;

  const draftFingerprint = createJournalDraftFingerprint({
    description: editor.description,
    notes: editor.notes,
    journalDate: editor.journalDate,
    journalTime: editor.journalTime,
    transactionType: editor.transactionType,
    lines: editor.lines,
    batchRows: batchEditor.rows,
  });
  const leaveGuard = useJournalEntryLeaveGuard({
    fingerprint: draftFingerprint,
    baselineReady: (!editor.isEdit && !editor.isCopy) || editor.loadState === 'loaded',
  });
  const { leaveAfterSave } = leaveGuard;
  const onDoneBatch = useCallback(() => {
    clearBatchAfterSave();
    leaveAfterSave();
  }, [clearBatchAfterSave, leaveAfterSave]);
  useEffect(() => {
    leaveAfterSaveRef.current = leaveAfterSave;
  }, [leaveAfterSave]);

  const suggestionTabType =
    activeMode === 'basic' || activeMode === 'allocation' ? editor.transactionType : undefined;
  const suggestionPage: JournalSuggestionPage =
    activeMode === 'allocation' ? 'split' : activeMode === 'expert' ? 'advanced' : 'simple';
  const { suggestions, suggestionState, loadSuggestions } = useJournalSuggestions(
    workplaceId,
    editor.description,
    suggestionTabType,
    suggestionPage,
  );

  const onSubmit = useCallback(() => {
    assertBound();
    if (activeMode === 'batch') {
      void saveBatch();
      return;
    }
    void session.submit(activeMode === 'allocation' ? 'allocation' : 'editor');
  }, [activeMode, assertBound, saveBatch, session]);

  const applyAccountToActiveLine = useCallback(
    (lineId: string, accountId: AccountId) => {
      let targetLineId = lineId;
      if (lineId === SPLIT_SOURCE_LINE_ID) {
        const sourceLine = editor.lines.find(
          line => line.transactionType === TransactionType.CREDIT,
        );
        if (!sourceLine) return;
        targetLineId = sourceLine.id;
      }

      applyJournalLineAccountSelection({
        lineId: targetLineId,
        accountId,
        accounts,
        updateLine: editor.updateLine,
      });
    },
    [accounts, editor.lines, editor.updateLine],
  );

  const {
    showAccountPicker,
    onSelectAccountRequest,
    onCloseAccountPicker,
    onAccountPickerDismiss,
    onAccountSelected,
    onCreateAccountRequest,
    onCreateAccountForTarget,
    selectableAccounts,
    selectedAccountId,
    accountPickerTitle,
  } = useJournalEntryAccountPicker({
    accounts,
    editor,
    activeMode,
    applyAccountToActiveLine,
    splitSourceAccountId: splitState.sourceAccountId,
    splitRows: splitState.splits,
    batchEditor,
  });

  const onSelectSuggestion = useCallback(
    (suggestion: JournalSuggestion) =>
      applyJournalSuggestion(editor, accounts, activeMode, suggestion),
    [editor, accounts, activeMode],
  );

  const headerTitle = useMemo(
    () => resolveJournalEntryHeaderTitle({ isEdit: editor.isEdit, isCopy: editor.isCopy }),
    [editor.isCopy, editor.isEdit],
  );

  return {
    editor,
    inboxItems,
    people,
    peopleGroups,
    initialPersonId: seed.personId,
    initialOpenItemId: seed.openItemId,
    onQuickAddPerson,
    onTransferOpenItemPlanChange,
    guidedAutopilot: seed.guidedAutopilot === true,
    splitState,
    validationIssues: session.validationIssues,
    splitValidation: session.splitValidation,
    onSubmit,
    accounts,
    activeMode,
    onToggleMode,
    isLoading: editor.isLoading,
    loadState: editor.loadState,
    headerTitle,
    showEditBanner: editor.isEdit || editor.isCopy,
    editBannerText: editor.isCopy
      ? AppConfig.strings.transactionFlow.banners.copying
      : AppConfig.strings.transactionFlow.banners.editing,
    showAccountPicker,
    onCloseAccountPicker,
    onAccountPickerDismiss,
    onClose: leaveGuard.onClose,
    onSelectAccountRequest,
    onAccountSelected,
    selectedAccountId,
    selectableAccounts,
    accountPickerTitle,
    isSimpleModeDisabled,
    isSplitModeDisabled,
    onCreateAccountRequest,
    onCreateAccountForTarget,
    suggestions,
    suggestionState,
    onSelectSuggestion,
    loadSuggestions,
    workplaceCurrency,
    workplaceId,
    batchEditor,
    batchSummary,
    onContinueBatch,
    onDoneBatch,
    saveSuccessPulse,
  };
}
