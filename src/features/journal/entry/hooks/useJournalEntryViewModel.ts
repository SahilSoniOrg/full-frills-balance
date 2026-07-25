import { AppConfig } from '@/src/constants';
import { CreateAccountIntent } from '@/src/components/common/AccountPickerModal';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import Account from '@/src/data/models/Account';
import { useAccounts } from '@/src/features/accounts';
import { useAdvancedJournalSummary } from '@/src/features/journal/entry/hooks/useAdvancedJournalSummary';
import {
  SavedJournalSummary,
  useBulkJournalEditor,
} from '@/src/features/journal/entry/hooks/useBulkJournalEditor';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { useJournalEntryAccountPicker } from '@/src/features/journal/entry/hooks/useJournalEntryAccountPicker';
import { useJournalEntryMode } from '@/src/features/journal/entry/hooks/useJournalEntryMode';
import { useJournalEntryVoiceInput } from '@/src/features/journal/entry/hooks/useJournalEntryVoiceInput';
import { useSimpleJournalEditor } from '@/src/features/journal/entry/hooks/useSimpleJournalEditor';
import { useJournalSuggestions } from '@/src/features/journal/hooks/useJournalSuggestions';
import { useSplitJournalEditor } from '@/src/features/journal/entry/hooks/useSplitJournalEditor';
import { JournalCalculator } from '@/src/services/accounting/JournalCalculator';
import {
  createSmsJournalAfterSaveHandler,
  isAdvancedJournalFormValid,
  isJournalEntrySubmitDisabled,
  parseJournalEntryRouteParams,
  resolveJournalEntryHeaderTitle,
  resolveJournalEntrySubmitLabel,
} from '@/src/features/journal/entry/journalEntryPresentation';
import { isSimpleModeDisabledByLines } from '@/src/services/journal/journalEditorHelpers';
import { smsService } from '@/src/services/sms-service';
import { AccountId, AccountRole, WorkplaceId } from '@/src/types/domain';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Keyboard } from 'react-native';
import { AppNavigation } from '@/src/utils/navigation';

export interface JournalEntryViewModel {
  editor: ReturnType<typeof useJournalEditor>;
  simpleEditor: ReturnType<typeof useSimpleJournalEditor>;
  accounts: ReturnType<typeof useAccounts>['accounts'];
  activeMode: 'guided' | 'advanced' | 'bulk' | 'split';
  onToggleMode: (mode: 'guided' | 'advanced' | 'bulk' | 'split') => void;
  splitEditor: ReturnType<typeof useSplitJournalEditor>;
  bulkEditor: ReturnType<typeof useBulkJournalEditor>;
  savedSummary: { count: number; items: SavedJournalSummary[] } | null;
  setSavedSummary: (summary: { count: number; items: SavedJournalSummary[] } | null) => void;
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
  primaryDisplayAmount: string;
  primaryDisplayCurrency: string;
  availableCurrencies: string[];
  selectedCurrency: string;
  onSelectCurrency: (currency: string) => void;
  totalDebits: number;
  totalCredits: number;
  isBalanced: boolean;
  isBalancedDisplay: boolean;
  baseImbalance: number;
  onCreateAccountRequest: (intent: CreateAccountIntent) => void;
  submitLabel: string;
  isSubmitDisabled: boolean;
  handleSubmit: () => void;
  isAmountFocused: boolean;
  setIsAmountFocused: (focused: boolean) => void;
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

  const { accounts, isLoading: isLoadingAccounts } = useAccounts(workplaceId);

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
    onAfterSave: createSmsJournalAfterSaveHandler({
      smsId: route.smsId,
      smsRecordId: route.smsRecordId,
      finalizeManualImport: smsService.finalizeManualImport.bind(smsService),
      markSmsAsProcessed: (smsId: string) => Promise.resolve(smsService.markSmsAsProcessed(smsId)),
    }),
    onSuccess: () => AppNavigation.back(),
  });

  const isSimpleModeDisabled = isSimpleModeDisabledByLines(editor.lines);

  const { suggestions } = useJournalSuggestions(workplaceId, editor.description);

  const { activeMode, onToggleMode, isGuidedScreen } = useJournalEntryMode(editor, {
    routeMode: route.mode,
    isSimpleModeDisabled,
  });

  const {
    splitEditor,
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
  });

  const simpleEditor = useSimpleJournalEditor({
    accounts,
    editor,
    onSelectAccountRequest: (role: AccountRole) => {
      const lineId = editor.getLineIdByRole(role);
      if (lineId) {
        onSelectAccountRequest(lineId);
      }
    },
  });

  const { isVoiceModalVisible, setIsVoiceModalVisible, handleApplyVoiceInput } =
    useJournalEntryVoiceInput({
      accounts,
      editor,
      simpleEditor,
    });

  const [savedSummary, setSavedSummary] = useState<{
    count: number;
    items: SavedJournalSummary[];
  } | null>(null);

  const bulkEditor = useBulkJournalEditor({
    workplaceId,
    workplaceCurrency,
    accounts,
    onSaveSuccess: useCallback(
      (count: number, summaries: SavedJournalSummary[]) => {
        setSavedSummary({ count, items: summaries });
      },
      [setSavedSummary],
    ),
  });

  const [isAmountFocused, setIsAmountFocused] = useState(false);

  const headerTitle = useMemo(
    () => resolveJournalEntryHeaderTitle({ isEdit: editor.isEdit }),
    [editor.isEdit],
  );

  const isSimpleValid =
    simpleEditor.isValidAmount &&
    !!simpleEditor.sourceId &&
    !!simpleEditor.destinationId &&
    simpleEditor.sourceId !== simpleEditor.destinationId &&
    !simpleEditor.isSubmitting &&
    !simpleEditor.isLoadingRate &&
    !simpleEditor.rateError;

  const {
    totalDebits,
    totalCredits,
    isBalanced,
    isBalancedDisplay,
    imbalance,
    availableCurrencies,
    selectedCurrency,
    setSelectedCurrency,
  } = useAdvancedJournalSummary(editor.lines);

  const primaryDisplayCurrency = useMemo(() => {
    if (isGuidedScreen) return simpleEditor.displayCurrency;

    const firstLineCurrency = editor.lines[0]?.accountCurrency;
    if (firstLineCurrency) return firstLineCurrency;

    const lineWithCurrency = editor.lines.find(l => !!l.accountCurrency);
    if (lineWithCurrency?.accountCurrency) return lineWithCurrency.accountCurrency;

    return workplaceCurrency;
  }, [isGuidedScreen, editor.lines, simpleEditor.displayCurrency, workplaceCurrency]);

  const primaryDisplayAmount = useMemo(() => {
    if (isGuidedScreen) return simpleEditor.amount;
    return JournalCalculator.roundAmount(totalDebits).toFixed(2);
  }, [isGuidedScreen, simpleEditor.amount, totalDebits]);

  const isAdvancedValid = isAdvancedJournalFormValid({
    isBalanced,
    description: editor.description,
    lines: editor.lines,
    isSubmitting: editor.isSubmitting,
  });

  const isSplitValid = splitEditor.isValid && !splitEditor.isSubmitting;

  const handleSubmit = useCallback(() => {
    if (activeMode === 'bulk') {
      bulkEditor.saveAll();
    } else if (activeMode === 'split') {
      splitEditor.handleSave();
    } else if (activeMode === 'guided') {
      if (isAmountFocused && !isSimpleValid) {
        Keyboard.dismiss();
      } else {
        simpleEditor.handleSave();
      }
    } else {
      editor.submit();
    }
  }, [activeMode, bulkEditor, editor, isAmountFocused, isSimpleValid, simpleEditor, splitEditor]);

  const isSubmitDisabled = useMemo(
    () =>
      isJournalEntrySubmitDisabled({
        activeMode,
        bulkSubmitting: bulkEditor.isSubmitting,
        bulkValid: bulkEditor.isValid,
        isAmountFocused,
        isSimpleValid,
        isAdvancedValid,
        isSplitValid,
      }),
    [
      activeMode,
      bulkEditor.isSubmitting,
      bulkEditor.isValid,
      isAmountFocused,
      isSimpleValid,
      isAdvancedValid,
      isSplitValid,
    ],
  );

  const submitLabel = useMemo(
    () =>
      resolveJournalEntrySubmitLabel({
        activeMode,
        bulkSubmitting: bulkEditor.isSubmitting,
        bulkRowCount: bulkEditor.rows.length,
        isAmountFocused,
        isSimpleValid,
        simpleSubmitting: simpleEditor.isSubmitting,
        simpleType: simpleEditor.type,
        isEdit: editor.isEdit,
        isSubmitting: editor.isSubmitting,
        splitSubmitting: splitEditor.isSubmitting,
      }),
    [
      activeMode,
      bulkEditor.isSubmitting,
      bulkEditor.rows.length,
      editor.isSubmitting,
      editor.isEdit,
      isAmountFocused,
      isSimpleValid,
      simpleEditor.isSubmitting,
      simpleEditor.type,
      splitEditor.isSubmitting,
    ],
  );

  return {
    editor,
    simpleEditor,
    splitEditor,
    accounts,
    activeMode,
    onToggleMode,
    bulkEditor,
    savedSummary,
    setSavedSummary,
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
    isBalanced,
    isBalancedDisplay,
    baseImbalance: imbalance,
    primaryDisplayAmount,
    primaryDisplayCurrency,
    availableCurrencies,
    selectedCurrency,
    onSelectCurrency: setSelectedCurrency,
    totalDebits,
    totalCredits,
    onCreateAccountRequest,
    submitLabel,
    isSubmitDisabled,
    handleSubmit,
    isAmountFocused,
    setIsAmountFocused,
    suggestions,
    workplaceCurrency,
    workplaceId,
    isVoiceModalVisible,
    setIsVoiceModalVisible,
    handleApplyVoiceInput,
  };
}
