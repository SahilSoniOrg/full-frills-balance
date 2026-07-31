import { CreateAccountIntent } from '@/src/components/common/AccountPickerModal';
import { AppConfig } from '@/src/constants';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import Account, { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { useAccounts } from '@/src/features/accounts';
import { SavedJournalSummary } from '@/src/features/journal/entry/hooks/useBulkJournalEditor';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { useJournalEntryAccountPicker } from '@/src/features/journal/entry/hooks/useJournalEntryAccountPicker';
import {
  createSmsJournalAfterSaveHandler,
  JournalEntryScreenMode,
  parseJournalEntryRouteParams,
  resolveJournalEntryHeaderTitle,
  resolveJournalEntryScreenMode,
} from '@/src/features/journal/entry/journalEntryPresentation';
import { useActiveModeHandle } from '@/src/features/journal/entry/modes/ModeHandleContext';
import { useJournalSuggestions } from '@/src/features/journal/hooks/useJournalSuggestions';
import { isSimpleModeDisabledByLines } from '@/src/services/journal/journalEditorHelpers';
import { smsService } from '@/src/services/sms-service';
import { AccountId, WorkplaceId } from '@/src/types/domain';
import { showErrorAlert } from '@/src/utils/alerts';
import { AppNavigation } from '@/src/utils/navigation';
import { useLocalSearchParams } from 'expo-router';
import { MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Shell-facing contract for journal entry.
 * Owns screen mode + ModeHandle wiring; mode panels own mode-local editors.
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
  isVoiceModalVisible: boolean;
  setIsVoiceModalVisible: (visible: boolean) => void;
  handleApplyVoiceInput: (params: {
    amount?: number;
    merchantName?: string;
    direction: 'debit' | 'credit' | 'unknown';
    sourceAccountId: AccountId;
    categoryAccountId: AccountId;
    transcription: string;
  }) => void;
}

/** @deprecated Use JournalEntryShell */
export type JournalEntryViewModel = JournalEntryShell;

/**
 * Journal entry shell: screen mode SSOT, shared editor, account picker, ModeHandle consumer.
 * Guided/Advanced/Bulk/Split editors live in lazy mode panels.
 */
export function useJournalEntryShell(): JournalEntryShell {
  const params = useLocalSearchParams();
  const route = parseJournalEntryRouteParams(params);
  const { workplaceId, defaultCurrencyCode: workplaceCurrency } = useWorkplace();
  const modeHandle = useActiveModeHandle();

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

  const isSimpleModeDisabled = isSimpleModeDisabledByLines(editor.lines);

  const { suggestions } = useJournalSuggestions(workplaceId, editor.description);

  // Screen mode owned here only (one-way → editor.isGuidedMode).
  const [activeMode, setActiveMode] = useState<JournalEntryScreenMode>(() =>
    resolveJournalEntryScreenMode(route.mode),
  );

  const { setIsGuidedMode, setTransactionType } = editor;

  useEffect(() => {
    setIsGuidedMode(activeMode === 'guided');
    if (activeMode === 'split') {
      setTransactionType('expense');
    }
  }, [activeMode, setIsGuidedMode, setTransactionType]);

  const onToggleMode = useCallback(
    (mode: JournalEntryScreenMode) => {
      if (mode === 'guided' && isSimpleModeDisabled) {
        showErrorAlert(AppConfig.strings.validation.simpleModeTooManyLines, undefined, __DEV__);
        return;
      }
      setActiveMode(mode);
    },
    [isSimpleModeDisabled],
  );

  const applyAccountToActiveLine = useCallback(
    (lineId: string, accountId: AccountId) => {
      if (modeHandle?.applyAccount) {
        modeHandle.applyAccount(lineId, accountId);
        return;
      }

      const account = accounts.find(a => a.id === accountId);
      if (account) {
        editor.updateLine(lineId, {
          accountId,
          accountName: account.name,
          accountType: account.accountType,
          accountCurrency: account.currencyCode,
        });
      }
    },
    [accounts, editor, modeHandle],
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
    resolveModeSelectedAccountId: modeHandle?.resolveSelectedAccountId,
  });

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

  const [isVoiceModalVisible, setIsVoiceModalVisible] = useState(false);

  const handleApplyVoiceInput = useCallback(
    (params: {
      amount?: number;
      merchantName?: string;
      direction: 'debit' | 'credit' | 'unknown';
      transactionType?: 'expense' | 'income' | 'transfer';
      sourceAccountId: AccountId;
      categoryAccountId: AccountId;
      transcription: string;
    }) => {
      const {
        amount,
        merchantName,
        direction,
        transactionType,
        sourceAccountId,
        categoryAccountId,
        transcription,
      } = params;

      if (merchantName) {
        editor.setDescription(merchantName);
      }
      if (transcription) {
        editor.setNotes(`Spoken transcript: ${transcription}`);
      }

      if (modeHandle?.applyVoice) {
        modeHandle.applyVoice(params);
        return;
      }

      const mappedType = transactionType || (direction === 'credit' ? 'income' : 'expense');
      editor.setTransactionType(mappedType);
      editor.setLines(prev =>
        prev.map(line => {
          const isDebit = line.transactionType === TransactionType.DEBIT;

          const lineAccountId =
            mappedType === 'income'
              ? isDebit
                ? sourceAccountId
                : categoryAccountId
              : isDebit
                ? categoryAccountId
                : sourceAccountId;

          const account = accounts.find(a => a.id === lineAccountId);

          return {
            ...line,
            accountId: lineAccountId,
            accountName: account?.name || '',
            accountType: account?.accountType || AccountType.ASSET,
            accountCurrency: account?.currencyCode,
            amount: amount ? String(amount) : line.amount,
          };
        }),
      );
    },
    [accounts, editor, modeHandle],
  );

  return {
    editor,
    accounts,
    activeMode,
    onToggleMode,
    savedSummary,
    setSavedSummary,
    onBulkSaveSuccess,
    bulkActionsRef,
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
    isVoiceModalVisible,
    setIsVoiceModalVisible,
    handleApplyVoiceInput,
  };
}

/** @deprecated Use useJournalEntryShell */
export const useJournalEntryViewModel = useJournalEntryShell;
