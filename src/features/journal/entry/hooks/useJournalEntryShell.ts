import type { CreateAccountIntent } from '@/src/components/account-selection';
import { useAccounts } from '@/src/components/account-selection';
import { AppConfig } from '@/src/constants';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import type { AccountFields } from '@/src/types/plainDtos';
import type { JournalAutofillSuggestion } from '@/src/data/repositories/journal/journalEnrichmentTypes';
import type { SavedJournalSummary } from '@/src/features/journal/entry/types/bulkJournal';
import { useBulkJournalEditor } from '@/src/features/journal/entry/hooks/useBulkJournalEditor';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { useJournalEntryAccountPicker } from '@/src/features/journal/entry/hooks/useJournalEntryAccountPicker';
import { applyJournalLineAccountSelection } from '@/src/features/journal/entry/journalEntryAccountPickerPolicy';
import {
  createSmsJournalAfterSaveHandler,
  JournalEntryScreenMode,
  resolveJournalEntryHeaderTitle,
} from '@/src/features/journal/entry/journalEntryPresentation';
import { parseTransactionIntentSeed } from '@/src/features/journal/entry/journalEntryRouteAdapter';
import {
  GuidedFooterAmount,
  GuidedVoiceActions,
} from '@/src/features/journal/entry/modes/guided/GuidedModePanel';
import type { ModeHandle, ModeSubmitState } from '@/src/features/journal/entry/modes/ModeHandle';
import { useJournalEntryModeState } from '@/src/features/journal/entry/hooks/useJournalEntryModeState';
import { useSplitEntryState } from '@/src/features/journal/entry/hooks/useSplitEntryState';
import { useJournalSuggestions } from '@/src/features/journal/hooks/useJournalSuggestions';
import { analytics } from '@/src/services/analytics';
import {
  isSimpleTargetAccountUnset,
  resolveTargetAccountIdForSimpleTab,
} from '@/src/services/journal/simpleJournalHelpers';
import { smsService } from '@/src/services/sms-service';
import { AccountId, EMPTY_ACCOUNT_ID, WorkplaceId } from '@/src/types/ids';
import { TransactionType } from '@/src/types/enums';
import { AppNavigation } from '@/src/utils/navigation';
import { useLocalSearchParams } from 'expo-router';
import { MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Shell-facing contract for journal entry.
 * Owns screen mode + ModeHandle (submit) wiring; mode panels own mode-local UI.
 */
export interface JournalEntryShell {
  editor: ReturnType<typeof useJournalEditor>;
  splitDraft: ReturnType<typeof useSplitEntryState>;
  bulkEditor: ReturnType<typeof useBulkJournalEditor>;
  modeSubmitState: ModeSubmitState | null;
  onModeHandleChange: (handle: ModeHandle | null) => void;
  onSubmit: () => void;
  accounts: ReturnType<typeof useAccounts>['accounts'];
  activeMode: JournalEntryScreenMode;
  onToggleMode: (mode: JournalEntryScreenMode) => void;
  savedSummary: { count: number; items: SavedJournalSummary[] } | null;
  setSavedSummary: (summary: { count: number; items: SavedJournalSummary[] } | null) => void;
  onBulkSaveSuccess: (count: number, summaries: SavedJournalSummary[]) => void;
  bulkActionsRef: MutableRefObject<{ clearRows: () => void } | null>;
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
  onSelectSuggestion: (suggestion: JournalAutofillSuggestion) => void;
  loadSuggestions: () => void;
  workplaceCurrency: string;
  workplaceId: WorkplaceId;
}

/**
 * Journal entry shell: screen mode SSOT, shared editor, account picker.
 * Mode panels own their draft and account application through the active mode handle.
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

  const editor = useJournalEditor(workplaceId, {
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

  const { activeMode, onToggleMode, isSimpleModeDisabled } = useJournalEntryModeState(
    editor,
    seed.editorMode,
  );

  const splitDraft = useSplitEntryState(editor.lines.find(line => line.amount)?.amount);
  const previousModeRef = useRef(activeMode);
  useEffect(() => {
    const enteredSplit = activeMode === 'split' && previousModeRef.current !== 'split';
    previousModeRef.current = activeMode;
    if (!enteredSplit) return;

    const sharedAmount = editor.lines.find(line => line.amount?.trim())?.amount;
    if (sharedAmount && sharedAmount !== splitDraft.totalAmount) {
      splitDraft.setTotalAmount(sharedAmount);
    }
  }, [activeMode, editor.lines, splitDraft.setTotalAmount, splitDraft.totalAmount]);

  const suggestionTabType = activeMode === 'guided' ? editor.transactionType : undefined;
  const { suggestions, loadSuggestions } = useJournalSuggestions(
    workplaceId,
    editor.description,
    suggestionTabType,
  );

  const modeHandleRef = useRef<ModeHandle | null>(null);
  const [modeSubmitState, setModeSubmitState] = useState<ModeSubmitState | null>(null);
  const onModeHandleChange = useCallback((handle: ModeHandle | null) => {
    modeHandleRef.current = handle;
    setModeSubmitState(current => {
      const next = handle
        ? {
            submitLabel: handle.submitLabel,
            isSubmitDisabled: handle.isSubmitDisabled,
            isSubmitting: handle.isSubmitting ?? false,
          }
        : null;
      return current &&
        next &&
        current.submitLabel === next.submitLabel &&
        current.isSubmitDisabled === next.isSubmitDisabled &&
        current.isSubmitting === next.isSubmitting
        ? current
        : next;
    });
  }, []);
  const onSubmit = useCallback(() => {
    modeHandleRef.current?.submit();
  }, []);

  const applyAccountToActiveLine = useCallback(
    (lineId: string, accountId: AccountId) => {
      if (activeMode === 'guided' || activeMode === 'advanced') {
        applyJournalLineAccountSelection({
          lineId,
          accountId,
          accounts,
          updateLine: editor.updateLine,
        });
        return;
      }
      modeHandleRef.current?.applyAccountToLine?.(lineId, accountId);
    },
    [activeMode, accounts, editor.updateLine],
  );

  const resolvePickerSelectedAccountId = useCallback(
    (lineId: string) => {
      if (activeMode === 'guided' || activeMode === 'advanced') {
        return editor.lines.find(line => line.id === lineId)?.accountId;
      }
      return modeHandleRef.current?.resolveSelectedAccountId?.(lineId);
    },
    [activeMode, editor.lines],
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
    resolveModeSelectedAccountId: resolvePickerSelectedAccountId,
    splitSourceAccountId: splitDraft.sourceAccountId,
    splitRows: splitDraft.splits,
  });

  const [guidedFooterAmount, setGuidedFooterAmount] = useState<GuidedFooterAmount | null>(null);
  const onGuidedFooterAmountChange = useCallback((footer: GuidedFooterAmount | null) => {
    setGuidedFooterAmount(footer);
  }, []);

  const [savedSummary, setSavedSummary] = useState<{
    count: number;
    items: SavedJournalSummary[];
  } | null>(null);

  const bulkActionsRef = useRef<{ clearRows: () => void } | null>(null);

  const onBulkSaveSuccess = useCallback((count: number, summaries: SavedJournalSummary[]) => {
    setSavedSummary({ count, items: summaries });
  }, []);

  const bulkEditor = useBulkJournalEditor({
    workplaceId,
    workplaceCurrency,
    accounts,
    onSaveSuccess: onBulkSaveSuccess,
  });

  const onSelectSuggestion = useCallback(
    (suggestion: JournalAutofillSuggestion) => {
      analytics.trackFeatureUsage('journal', 'suggestion_accepted', {
        has_target_account: !!suggestion.targetAccountId,
        target_account_type: suggestion.targetAccountType || 'none',
        mode: activeMode,
      });

      editor.setDescription(suggestion.description);

      if (activeMode !== 'guided') return;

      const sourceLine = editor.lines.find(l => l.transactionType === TransactionType.CREDIT);
      const destLine = editor.lines.find(l => l.transactionType === TransactionType.DEBIT);
      const sourceId = sourceLine?.accountId ?? EMPTY_ACCOUNT_ID;
      const destId = destLine?.accountId ?? EMPTY_ACCOUNT_ID;

      const tabType = editor.transactionType;
      // Non-destructive: only auto-select if target category is currently unset
      if (!isSimpleTargetAccountUnset(tabType, sourceId, destId)) {
        return;
      }

      const targetAccountId = resolveTargetAccountIdForSimpleTab(suggestion, tabType);
      if (!targetAccountId) return;

      const account = accounts.find(a => a.id === targetAccountId);
      if (!account) return;

      if (tabType === 'income') {
        if (sourceLine) {
          editor.updateLine(sourceLine.id, {
            accountId: targetAccountId,
            accountName: account.name,
            accountType: account.accountType,
            accountCurrency: account.currencyCode,
          });
        }
      } else {
        // expense or transfer: target is the destination (DEBIT) line
        if (destLine) {
          editor.updateLine(destLine.id, {
            accountId: targetAccountId,
            accountName: account.name,
            accountType: account.accountType,
            accountCurrency: account.currencyCode,
          });
        }
      }
    },
    [editor, activeMode, accounts],
  );

  const headerTitle = useMemo(
    () => resolveJournalEntryHeaderTitle({ isEdit: editor.isEdit }),
    [editor.isEdit],
  );

  const guidedVoiceActionsRef = useRef<GuidedVoiceActions | null>(null);

  return {
    editor,
    splitDraft,
    bulkEditor,
    modeSubmitState,
    onModeHandleChange,
    onSubmit,
    accounts,
    activeMode,
    onToggleMode,
    savedSummary,
    setSavedSummary,
    onBulkSaveSuccess,
    bulkActionsRef,
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
    onSelectSuggestion,
    loadSuggestions,
    workplaceCurrency,
    workplaceId,
  };
}
