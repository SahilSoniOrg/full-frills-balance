import { useAccounts, type CreateAccountIntent } from '@/src/components/account-selection';
import { AppConfig } from '@/src/constants';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import type { AccountFields } from '@/src/types/plainDtos';
import type { JournalAutofillSuggestion } from '@/src/data/repositories/journal/journalEnrichmentTypes';
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
  resolveJournalEntryHeaderTitle,
} from '@/src/features/journal/entry/journalEntryPresentation';
import { parseTransactionIntentSeed } from '@/src/features/journal/entry/journalEntryRouteAdapter';
import { useJournalEntryModeState } from '@/src/features/journal/entry/hooks/useJournalEntryModeState';
import {
  createJournalDraftFingerprint,
  useJournalEntryLeaveGuard,
} from '@/src/features/journal/entry/hooks/useJournalEntryLeaveGuard';
import { useTransactionComposerSession } from '@/src/features/journal/entry/hooks/useTransactionComposerSession';
import { useBatchJournalSession } from '@/src/features/journal/entry/hooks/useBatchJournalSession';
import type { useBulkJournalEditor } from '@/src/features/journal/entry/hooks/useBulkJournalEditor';
import type { SavedJournalSummary } from '@/src/features/journal/entry/types/bulkJournal';
import { useJournalSuggestionApplication } from '@/src/features/journal/entry/hooks/useJournalSuggestionApplication';
import {
  JournalSuggestionState,
  useJournalSuggestions,
} from '@/src/features/journal/hooks/useJournalSuggestions';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { TransactionType } from '@/src/types/enums';
import { SPLIT_SOURCE_LINE_ID } from '@/src/services/journal/splitJournalHelpers';
import { AppNavigation } from '@/src/utils/navigation';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Shell-facing contract for journal entry.
 * Owns the composer view, canonical drafts, submit state, and account-picker routing.
 */
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
  suggestions: JournalAutofillSuggestion[];
  suggestionState: JournalSuggestionState;
  onSelectSuggestion: (
    suggestion: JournalAutofillSuggestion,
  ) => AutopilotAppliedAccount | undefined;
  loadSuggestions: () => void;
  workplaceCurrency: string;
  workplaceId: WorkplaceId;
  batchEditor: ReturnType<typeof useBulkJournalEditor>;
  batchSummary: { count: number; items: SavedJournalSummary[] } | null;
  onContinueBatch: () => void;
  onDoneBatch: () => void;
  /** True briefly after a successful save so the CTA can pulse before leave. */
  saveSuccessPulse: boolean;
}

/**
 * Journal entry shell: screen mode SSOT, shared editor, account picker.
 * Panels are projections over the session-owned editor draft.
 */
export function useJournalEntryShell(): JournalEntryShell {
  const params = useLocalSearchParams();
  const seed = parseTransactionIntentSeed(params);
  const { workplaceId, defaultCurrencyCode: workplaceCurrency } = useWorkplace();

  const { accounts } = useAccounts(workplaceId);

  const leaveAfterSaveRef = useRef<() => void>(() => AppNavigation.back());
  const saveLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    initialMode:
      seed.editorMode === 'bulk' || seed.editorMode === 'split' ? undefined : seed.editorMode,
    initialType: seed.type,
    initialAmount: seed.amount,
    initialDescription: seed.description,
    initialNotes: seed.notes,
    smsId: seed.sourceContext?.smsId,
    smsRecordId: seed.sourceContext?.smsRecordId,
    smsSender: seed.sourceContext?.smsSender,
    rawSmsBody: seed.sourceContext?.rawSmsBody,
    initialDate: seed.date,
    initialSourceId: seed.sourceAccountId,
    initialDestinationId: seed.destinationAccountId,
    onSuccess,
  });
  const { editor, splitState } = session;

  const { activeMode, onToggleMode, isSimpleModeDisabled, isSplitModeDisabled } =
    useJournalEntryModeState(editor, seed.editorMode);

  const { batchEditor, batchSummary, onContinueBatch, onDoneBatch } = useBatchJournalSession(
    workplaceId,
    workplaceCurrency,
    accounts,
    onToggleMode,
  );
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
    baselineReady: !editor.isEdit || editor.loadState === 'loaded',
  });
  useEffect(() => {
    leaveAfterSaveRef.current = leaveGuard.leaveAfterSave;
  }, [leaveGuard.leaveAfterSave]);

  const suggestionTabType = activeMode === 'basic' ? editor.transactionType : undefined;
  const { suggestions, suggestionState, loadSuggestions } = useJournalSuggestions(
    workplaceId,
    editor.description,
    suggestionTabType,
  );

  const onSubmit = useCallback(() => {
    if (activeMode === 'batch') {
      void saveBatch();
      return;
    }
    void session.submit(activeMode === 'allocation' ? 'allocation' : 'editor');
  }, [activeMode, saveBatch, session]);

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

  const onSelectSuggestion = useJournalSuggestionApplication(editor, accounts, activeMode);

  const headerTitle = useMemo(
    () => resolveJournalEntryHeaderTitle({ isEdit: editor.isEdit }),
    [editor.isEdit],
  );

  return {
    editor,
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
    showEditBanner: editor.isEdit,
    editBannerText: AppConfig.strings.transactionFlow.banners.editing,
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
