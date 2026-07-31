import { AppConfig } from '@/src/constants';
import { CreateAccountIntent } from '@/src/components/common/AccountPickerModal';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import Account from '@/src/data/models/Account';
import { useAccounts } from '@/src/features/accounts';
import { SavedJournalSummary } from '@/src/features/journal/entry/hooks/useBulkJournalEditor';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { useJournalEntryAccountPicker } from '@/src/features/journal/entry/hooks/useJournalEntryAccountPicker';
import { useJournalEntryMode } from '@/src/features/journal/entry/hooks/useJournalEntryMode';
import { useActiveModeHandle } from '@/src/features/journal/entry/modes/ModeHandleContext';
import {
  createSmsJournalAfterSaveHandler,
  parseJournalEntryRouteParams,
  resolveJournalEntryHeaderTitle,
} from '@/src/features/journal/entry/journalEntryPresentation';
import { useJournalSuggestions } from '@/src/features/journal/hooks/useJournalSuggestions';
import { isSimpleModeDisabledByLines } from '@/src/services/journal/journalEditorHelpers';
import { smsService } from '@/src/services/sms-service';
import { AccountId, AccountType, WorkplaceId } from '@/src/types/domain';
import { TransactionType } from '@/src/data/models/Transaction';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { AppNavigation } from '@/src/utils/navigation';

export interface JournalEntryViewModel {
  editor: ReturnType<typeof useJournalEditor>;
  accounts: ReturnType<typeof useAccounts>['accounts'];
  activeMode: 'guided' | 'advanced' | 'bulk' | 'split';
  onToggleMode: (mode: 'guided' | 'advanced' | 'bulk' | 'split') => void;
  savedSummary: { count: number; items: SavedJournalSummary[] } | null;
  setSavedSummary: (summary: { count: number; items: SavedJournalSummary[] } | null) => void;
  onBulkSaveSuccess: (count: number, summaries: SavedJournalSummary[]) => void;
  bulkActionsRef: React.MutableRefObject<{ clearRows: () => void } | null>;
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

export function useJournalEntryViewModel(): JournalEntryViewModel {
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

  const { activeMode, onToggleMode } = useJournalEntryMode(editor, {
    routeMode: route.mode,
    isSimpleModeDisabled,
  });

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
    selectedAccountId: pickerSelectedAccountId,
  } = useJournalEntryAccountPicker({
    accounts,
    editor,
    activeMode,
    applyAccountToActiveLine,
  });

  const selectedAccountId = useMemo(() => {
    // Mode panels (split) may resolve selection from mode-local draft state.
    // Picker hook still owns activeLineId; we need it via resolve on handle.
    // Fall back to picker policy over editor lines.
    return pickerSelectedAccountId;
  }, [pickerSelectedAccountId]);

  // Re-resolve when mode handle provides split draft selection.
  const selectedAccountIdResolved = useMemo(() => {
    if (!modeHandle?.resolveSelectedAccountId || !pickerSelectedAccountId) {
      // pickerSelectedAccountId already resolved from editor lines for non-split.
      // For split, picker hook no longer receives split rows — resolve via handle.
      return undefined;
    }
    return undefined;
  }, [modeHandle, pickerSelectedAccountId]);
  void selectedAccountIdResolved;

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
