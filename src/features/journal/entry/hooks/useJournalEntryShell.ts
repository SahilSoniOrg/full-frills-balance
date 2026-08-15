import { CreateAccountIntent, useAccounts } from '@/src/features/accounts';
import { AppConfig } from '@/src/constants';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import Account from '@/src/data/models/Account';
import type { JournalAutofillSuggestion } from '@/src/data/repositories/journal/journalEnrichmentTypes';
import { SavedJournalSummary } from '@/src/features/journal/entry/hooks/useBulkJournalEditor';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { useJournalEntryAccountPicker } from '@/src/features/journal/entry/hooks/useJournalEntryAccountPicker';
import { applyJournalLineAccountSelection } from '@/src/features/journal/entry/journalEntryAccountPickerPolicy';
import {
  createSmsJournalAfterSaveHandler,
  JournalEntryScreenMode,
  parseJournalEntryRouteParams,
  resolveJournalEntryHeaderTitle,
} from '@/src/features/journal/entry/journalEntryPresentation';
import {
  GuidedFooterAmount,
  GuidedVoiceActions,
} from '@/src/features/journal/entry/modes/guided/GuidedModePanel';
import { useModeAccountActions } from '@/src/features/journal/entry/modes/ModeHandleContext';
import { useJournalEntryModeState } from '@/src/features/journal/entry/hooks/useJournalEntryModeState';
import { useJournalSuggestions } from '@/src/features/journal/hooks/useJournalSuggestions';
import { analytics } from '@/src/services/analytics-service';
import {
  isSimpleTargetAccountUnset,
  resolveTargetAccountIdForSimpleTab,
} from '@/src/services/journal/simpleJournalHelpers';
import { smsService } from '@/src/services/sms-service';
import { AccountId, EMPTY_ACCOUNT_ID, TransactionType, WorkplaceId } from '@/src/types/domain';
import { AppNavigation } from '@/src/utils/navigation';
import { useLocalSearchParams } from 'expo-router';
import { MutableRefObject, useCallback, useMemo, useRef, useState } from 'react';

/**
 * Shell-facing contract for journal entry.
 * Owns screen mode + ModeHandle (submit) wiring; mode panels own mode-local UI.
 */
export interface JournalEntryShell {
  editor: ReturnType<typeof useJournalEditor>;
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
  headerTitle: string;
  showEditBanner: boolean;
  editBannerText: string;
  showAccountPicker: boolean;
  onCloseAccountPicker: () => void;
  onSelectAccountRequest: (lineId: string) => void;
  onAccountSelected: (accountId: AccountId) => void;
  selectedAccountId?: AccountId;
  selectableAccounts: Account[];
  isSimpleModeDisabled: boolean;
  onCreateAccountRequest: (intent: CreateAccountIntent) => void;
  suggestions: JournalAutofillSuggestion[];
  onSelectSuggestion: (suggestion: JournalAutofillSuggestion) => void;
  workplaceCurrency: string;
  workplaceId: WorkplaceId;
}

/**
 * Journal entry shell: screen mode SSOT, shared editor, account picker.
 * Mode panels own their draft and account application through the active mode handle.
 */
export function useJournalEntryShell(): JournalEntryShell {
  const params = useLocalSearchParams();
  const route = parseJournalEntryRouteParams(params);
  const { workplaceId, defaultCurrencyCode: workplaceCurrency } = useWorkplace();

  const { accounts, isLoading: isLoadingAccounts } = useAccounts(workplaceId);

  const onAfterSave = useMemo(
    () =>
      createSmsJournalAfterSaveHandler({
        smsId: route.smsId,
        smsRecordId: route.smsRecordId,
        finalizeManualImport: smsService.finalizeManualImport.bind(smsService),
        markSmsAsProcessed: (smsId: string) =>
          Promise.resolve(smsService.markSmsAsProcessed(smsId)),
      }),
    [route.smsId, route.smsRecordId],
  );

  const onSuccess = useCallback(() => AppNavigation.back(), []);

  const editor = useJournalEditor(workplaceId, {
    journalId: route.journalId,
    initialMode: route.mode === 'bulk' || route.mode === 'split' ? undefined : route.mode,
    initialType: route.type,
    initialAmount: route.amount,
    initialDescription: route.notes,
    smsId: route.smsId,
    smsRecordId: route.smsRecordId,
    smsSender: route.smsSender,
    rawSmsBody: route.rawSmsBody,
    initialDate: route.initialDate,
    initialSourceId: route.sourceAccountId,
    initialDestinationId: route.destinationAccountId,
    onAfterSave,
    onSuccess,
  });

  const { suggestions } = useJournalSuggestions(workplaceId, editor.description);

  const { activeMode, onToggleMode, isSimpleModeDisabled } = useJournalEntryModeState(
    editor,
    route.mode,
  );

  const { applyAccountToLine, resolveSelectedAccountId } = useModeAccountActions();

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
      applyAccountToLine?.(lineId, accountId);
    },
    [activeMode, accounts, editor.updateLine, applyAccountToLine],
  );

  const resolvePickerSelectedAccountId = useCallback(
    (lineId: string) => {
      if (activeMode === 'guided' || activeMode === 'advanced') {
        return editor.lines.find(line => line.id === lineId)?.accountId;
      }
      return resolveSelectedAccountId?.(lineId);
    },
    [activeMode, editor.lines, resolveSelectedAccountId],
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
    isLoading: isLoadingAccounts || editor.isLoading,
    headerTitle,
    showEditBanner: editor.isEdit,
    editBannerText: AppConfig.strings.transactionFlow.banners.editing,
    showAccountPicker,
    onCloseAccountPicker,
    onSelectAccountRequest,
    onAccountSelected,
    selectedAccountId,
    selectableAccounts,
    isSimpleModeDisabled,
    onCreateAccountRequest,
    suggestions,
    onSelectSuggestion,
    workplaceCurrency,
    workplaceId,
  };
}
