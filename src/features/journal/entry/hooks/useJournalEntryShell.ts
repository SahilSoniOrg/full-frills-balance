import type { CreateAccountIntent } from '@/src/components/account-selection';
import { useAccounts } from '@/src/components/account-selection';
import { AppConfig } from '@/src/constants';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import type { AccountFields } from '@/src/types/plainDtos';
import type { JournalAutofillSuggestion } from '@/src/data/repositories/journal/journalEnrichmentTypes';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { useJournalEntryAccountPicker } from '@/src/features/journal/entry/hooks/useJournalEntryAccountPicker';
import { applyJournalLineAccountSelection } from '@/src/features/journal/entry/journalEntryAccountPickerPolicy';
import {
  JournalEntryScreenMode,
  resolveJournalEntryHeaderTitle,
} from '@/src/features/journal/entry/journalEntryPresentation';
import { createSmsJournalAfterSaveHandler } from '@/src/features/journal/entry/journalEntryPostSave';
import { parseTransactionIntentSeed } from '@/src/features/journal/entry/journalEntryRouteAdapter';
import {
  GuidedFooterAmount,
  GuidedVoiceActions,
} from '@/src/features/journal/entry/modes/guided/GuidedModePanel';
import { useJournalEntryModeState } from '@/src/features/journal/entry/hooks/useJournalEntryModeState';
import { useTransactionComposerSession } from '@/src/features/journal/entry/hooks/useTransactionComposerSession';
import { useBatchJournalSession } from '@/src/features/journal/entry/hooks/useBatchJournalSession';
import type { useBulkJournalEditor } from '@/src/features/journal/entry/hooks/useBulkJournalEditor';
import type { SavedJournalSummary } from '@/src/features/journal/entry/types/bulkJournal';
import { useJournalSuggestionApplication } from '@/src/features/journal/entry/hooks/useJournalSuggestionApplication';
import {
  JournalSuggestionState,
  useJournalSuggestions,
} from '@/src/features/journal/hooks/useJournalSuggestions';
import { smsService } from '@/src/services/sms-service';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { TransactionType } from '@/src/types/enums';
import { SPLIT_SOURCE_LINE_ID } from '@/src/services/journal/splitJournalHelpers';
import { AppNavigation } from '@/src/utils/navigation';
import { useLocalSearchParams } from 'expo-router';
import { MutableRefObject, useCallback, useMemo, useRef, useState } from 'react';

/**
 * Shell-facing contract for journal entry.
 * Owns the composer view, canonical drafts, submit state, and account-picker routing.
 */
export interface JournalEntryShell {
  editor: ReturnType<typeof useJournalEditor>;
  splitState: ReturnType<typeof useTransactionComposerSession>['splitState'];
  transactionIntent: ReturnType<typeof useTransactionComposerSession>['intent'];
  postingPlan: ReturnType<typeof useTransactionComposerSession>['postingPlan'];
  postingPlanValidation: ReturnType<typeof useTransactionComposerSession>['postingPlanValidation'];
  splitValidation: ReturnType<typeof useTransactionComposerSession>['splitValidation'];
  onSubmit: () => void;
  accounts: ReturnType<typeof useAccounts>['accounts'];
  activeMode: JournalEntryScreenMode;
  onToggleMode: (mode: JournalEntryScreenMode) => void;
  guidedFooterAmount: GuidedFooterAmount | null;
  onGuidedFooterAmountChange: (footer: GuidedFooterAmount | null) => void;
  guidedVoiceActionsRef: MutableRefObject<GuidedVoiceActions | null>;
  isLoading: boolean;
  loadState: ReturnType<typeof useJournalEditor>['loadState'];
  headerTitle: string;
  showEditBanner: boolean;
  editBannerText: string;
  showAccountPicker: boolean;
  onCloseAccountPicker: () => void;
  onClose: () => void;
  onSelectAccountRequest: (lineId: string) => void;
  onAccountSelected: (accountId: AccountId) => void;
  selectedAccountId?: AccountId;
  selectableAccounts: AccountFields[];
  isSimpleModeDisabled: boolean;
  onCreateAccountRequest: (intent: CreateAccountIntent) => void;
  suggestions: JournalAutofillSuggestion[];
  suggestionState: JournalSuggestionState;
  onSelectSuggestion: (suggestion: JournalAutofillSuggestion) => void;
  loadSuggestions: () => void;
  workplaceCurrency: string;
  workplaceId: WorkplaceId;
  batchEditor: ReturnType<typeof useBulkJournalEditor>;
  batchSummary: { count: number; items: SavedJournalSummary[] } | null;
  onContinueBatch: () => void;
  onDoneBatch: () => void;
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

  const onAfterSave = useMemo(
    () =>
      createSmsJournalAfterSaveHandler({
        smsId: seed.sourceContext?.smsId,
        markSmsAsProcessed: (smsId: string) =>
          Promise.resolve(smsService.markSmsAsProcessed(smsId)),
      }),
    [seed.sourceContext?.smsId],
  );

  const onSuccess = useCallback(() => AppNavigation.back(), []);

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
    onAfterSave,
    onSuccess,
  });
  const { editor, splitState } = session;

  const { activeMode, onToggleMode, isSimpleModeDisabled } = useJournalEntryModeState(
    editor,
    seed.editorMode,
  );

  const { batchEditor, batchSummary, onContinueBatch, onDoneBatch } = useBatchJournalSession(
    workplaceId,
    workplaceCurrency,
    accounts,
    onToggleMode,
  );
  const { saveAll: saveBatch } = batchEditor;

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
    onAccountSelected,
    onCreateAccountRequest,
    selectableAccounts,
    selectedAccountId,
  } = useJournalEntryAccountPicker({
    accounts,
    editor,
    activeMode,
    applyAccountToActiveLine,
    splitSourceAccountId: splitState.sourceAccountId,
    splitRows: splitState.splits,
  });

  const [guidedFooterAmount, setGuidedFooterAmount] = useState<GuidedFooterAmount | null>(null);
  const onGuidedFooterAmountChange = useCallback((footer: GuidedFooterAmount | null) => {
    setGuidedFooterAmount(footer);
  }, []);

  const onSelectSuggestion = useJournalSuggestionApplication(editor, accounts, activeMode);

  const headerTitle = useMemo(
    () => resolveJournalEntryHeaderTitle({ isEdit: editor.isEdit }),
    [editor.isEdit],
  );

  const guidedVoiceActionsRef = useRef<GuidedVoiceActions | null>(null);

  return {
    editor,
    splitState,
    transactionIntent: session.intent,
    postingPlan: session.postingPlan,
    postingPlanValidation: session.postingPlanValidation,
    splitValidation: session.splitValidation,
    onSubmit,
    accounts,
    activeMode,
    onToggleMode,
    guidedFooterAmount,
    onGuidedFooterAmountChange,
    guidedVoiceActionsRef,
    isLoading: editor.isLoading,
    loadState: editor.loadState,
    headerTitle,
    showEditBanner: editor.isEdit,
    editBannerText: AppConfig.strings.transactionFlow.banners.editing,
    showAccountPicker,
    onCloseAccountPicker,
    onClose: onSuccess,
    onSelectAccountRequest,
    onAccountSelected,
    selectedAccountId,
    selectableAccounts,
    isSimpleModeDisabled,
    onCreateAccountRequest,
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
  };
}
