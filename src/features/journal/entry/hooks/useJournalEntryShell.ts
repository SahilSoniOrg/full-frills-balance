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
  createSmsJournalAfterSaveHandler,
  JournalEntryScreenMode,
  resolveJournalEntryHeaderTitle,
} from '@/src/features/journal/entry/journalEntryPresentation';
import { parseTransactionIntentSeed } from '@/src/features/journal/entry/journalEntryRouteAdapter';
import {
  GuidedFooterAmount,
  GuidedVoiceActions,
} from '@/src/features/journal/entry/modes/guided/GuidedModePanel';
import { useJournalEntryModeState } from '@/src/features/journal/entry/hooks/useJournalEntryModeState';
import { useTransactionComposerSession } from '@/src/features/journal/entry/hooks/useTransactionComposerSession';
import { useJournalSuggestions } from '@/src/features/journal/hooks/useJournalSuggestions';
import { analytics } from '@/src/services/analytics';
import {
  isSimpleTargetAccountUnset,
  resolveTargetAccountIdForSimpleTab,
} from '@/src/services/journal/simpleJournalHelpers';
import { smsService } from '@/src/services/sms-service';
import { AccountId, EMPTY_ACCOUNT_ID, WorkplaceId } from '@/src/types/ids';
import { TransactionType } from '@/src/types/enums';
import { SPLIT_SOURCE_LINE_ID } from '@/src/services/journal/splitJournalHelpers';
import { AppNavigation } from '@/src/utils/navigation';
import { useLocalSearchParams } from 'expo-router';
import { MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Shell-facing contract for journal entry.
 * Owns the composer view, canonical drafts, submit state, and account-picker routing.
 */
export interface JournalEntryShell {
  editor: ReturnType<typeof useJournalEditor>;
  splitDraft: ReturnType<typeof useTransactionComposerSession>['splitDraft'];
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
  const { editor, splitDraft } = session;

  const { activeMode, onToggleMode, isSimpleModeDisabled } = useJournalEntryModeState(
    editor,
    seed.editorMode,
  );

  const { totalAmount: splitTotalAmount, setTotalAmount: setSplitTotalAmount } = splitDraft;
  const previousModeRef = useRef(activeMode);
  useEffect(() => {
    const enteredSplit = activeMode === 'allocation' && previousModeRef.current !== 'allocation';
    previousModeRef.current = activeMode;
    if (!enteredSplit) return;

    const sharedAmount = editor.lines.find(line => line.amount?.trim())?.amount;
    if (sharedAmount && sharedAmount !== splitTotalAmount) {
      setSplitTotalAmount(sharedAmount);
    }
  }, [activeMode, editor.lines, setSplitTotalAmount, splitTotalAmount]);

  const suggestionTabType = activeMode === 'basic' ? editor.transactionType : undefined;
  const { suggestions, loadSuggestions } = useJournalSuggestions(
    workplaceId,
    editor.description,
    suggestionTabType,
  );

  const onSubmit = useCallback(() => {
    void session.submit(activeMode === 'allocation' ? 'allocation' : 'editor');
  }, [activeMode, session]);

  const applyAccountToActiveLine = useCallback(
    (lineId: string, accountId: AccountId) => {
      if (activeMode === 'basic' || activeMode === 'expert') {
        applyJournalLineAccountSelection({
          lineId,
          accountId,
          accounts,
          updateLine: editor.updateLine,
        });
        return;
      }
      if (lineId === SPLIT_SOURCE_LINE_ID) {
        splitDraft.setSourceAccountId(accountId);
      } else {
        splitDraft.updateSplitRow(lineId, { accountId });
      }
    },
    [activeMode, accounts, editor.updateLine, splitDraft],
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
    splitSourceAccountId: splitDraft.sourceAccountId,
    splitRows: splitDraft.splits,
  });

  const [guidedFooterAmount, setGuidedFooterAmount] = useState<GuidedFooterAmount | null>(null);
  const onGuidedFooterAmountChange = useCallback((footer: GuidedFooterAmount | null) => {
    setGuidedFooterAmount(footer);
  }, []);

  const onSelectSuggestion = useCallback(
    (suggestion: JournalAutofillSuggestion) => {
      analytics.trackFeatureUsage('journal', 'suggestion_accepted', {
        has_target_account: !!suggestion.targetAccountId,
        target_account_type: suggestion.targetAccountType || 'none',
        mode: activeMode,
      });

      editor.setDescription(suggestion.description);

      if (activeMode !== 'basic') return;

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
    onSelectSuggestion,
    loadSuggestions,
    workplaceCurrency,
    workplaceId,
  };
}
