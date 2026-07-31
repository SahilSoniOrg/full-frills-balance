import { CreateAccountIntent } from '@/src/components/common/AccountPickerModal';
import { AppConfig } from '@/src/constants';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import Account from '@/src/data/models/Account';
import { useAccounts } from '@/src/features/accounts';
import { SavedJournalSummary } from '@/src/features/journal/entry/hooks/useBulkJournalEditor';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { useJournalEntryAccountPicker } from '@/src/features/journal/entry/hooks/useJournalEntryAccountPicker';
import { useSplitJournalEditor } from '@/src/features/journal/entry/hooks/useSplitJournalEditor';
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
import { useJournalEntryModeState } from '@/src/features/journal/entry/hooks/useJournalEntryModeState';
import { SplitJournalController } from '@/src/features/journal/entry/modes/split/splitJournalState';
import { useJournalSuggestions } from '@/src/features/journal/hooks/useJournalSuggestions';
import { SPLIT_SOURCE_LINE_ID } from '@/src/services/journal/splitJournalHelpers';
import { smsService } from '@/src/services/sms-service';
import { AccountId, EMPTY_ACCOUNT_ID, WorkplaceId } from '@/src/types/domain';
import { AppNavigation } from '@/src/utils/navigation';
import { useLocalSearchParams } from 'expo-router';
import { MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
  splitEditor: SplitJournalController;
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
  suggestions: string[];
  workplaceCurrency: string;
  workplaceId: WorkplaceId;
}

/** @deprecated Use JournalEntryShell */
export type JournalEntryViewModel = JournalEntryShell;

/**
 * Journal entry shell: screen mode SSOT, shared editor, account picker.
 * Split draft lives here so account apply works via switch(activeMode), not ModeHandle.
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

  const onSelectAccountRequestRef = useRef<(lineId: string) => void>(() => {});

  const splitEditor = useSplitJournalEditor({
    accounts,
    editor,
    onSelectAccountRequest: (lineId: string) => onSelectAccountRequestRef.current(lineId),
    isActive: activeMode === 'split',
  });

  const applyAccountToActiveLine = useCallback(
    (lineId: string, accountId: AccountId) => {
      switch (activeMode) {
        case 'split': {
          if (lineId === SPLIT_SOURCE_LINE_ID) {
            splitEditor.setSourceAccountId(accountId);
          } else {
            splitEditor.updateSplitRow(lineId, { accountId });
          }
          return;
        }
        case 'guided':
        case 'advanced':
        case 'bulk':
        default: {
          const account = accounts.find(a => a.id === accountId);
          if (account) {
            editor.updateLine(lineId, {
              accountId,
              accountName: account.name,
              accountType: account.accountType,
              accountCurrency: account.currencyCode,
            });
          }
        }
      }
    },
    [accounts, activeMode, editor, splitEditor],
  );

  const resolveModeSelectedAccountId = useCallback(
    (activeLineId: string) => {
      if (activeMode !== 'split') return undefined;
      if (activeLineId === SPLIT_SOURCE_LINE_ID) {
        return splitEditor.sourceAccountId !== EMPTY_ACCOUNT_ID
          ? splitEditor.sourceAccountId
          : undefined;
      }
      return splitEditor.splits.find(s => s.id === activeLineId)?.accountId;
    },
    [activeMode, splitEditor.sourceAccountId, splitEditor.splits],
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
    resolveModeSelectedAccountId,
    splitSourceAccountId: splitEditor.sourceAccountId,
    splitRows: splitEditor.splits,
  });

  useEffect(() => {
    onSelectAccountRequestRef.current = onSelectAccountRequest;
  }, [onSelectAccountRequest]);

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
    splitEditor,
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
    workplaceCurrency,
    workplaceId,
  };
}

/** @deprecated Use useJournalEntryShell */
export const useJournalEntryViewModel = useJournalEntryShell;
