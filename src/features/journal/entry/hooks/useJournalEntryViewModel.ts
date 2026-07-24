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
import { useJournalEntryAccountSelection } from '@/src/features/journal/entry/hooks/useJournalEntryAccountSelection';
import { useJournalEntryVoiceInput } from '@/src/features/journal/entry/hooks/useJournalEntryVoiceInput';
import { useSimpleJournalEditor } from '@/src/features/journal/entry/hooks/useSimpleJournalEditor';
import { useJournalSuggestions } from '@/src/features/journal/hooks/useJournalSuggestions';
import { JournalCalculator } from '@/src/services/accounting/JournalCalculator';
import {
  createSmsJournalAfterSaveHandler,
  isAdvancedJournalFormValid,
  isJournalEntrySubmitDisabled,
  parseJournalEntryRouteParams,
  resolveJournalEntryHeaderTitle,
  resolveJournalEntryScreenMode,
  resolveJournalEntrySubmitLabel,
} from '@/src/features/journal/entry/journalEntryPresentation';
import { smsService } from '@/src/services/sms-service';
import { AccountId, AccountRole, WorkplaceId } from '@/src/types/domain';
import { showErrorAlert } from '@/src/utils/alerts';
import { AppNavigation } from '@/src/utils/navigation';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Keyboard } from 'react-native';

export interface JournalEntryViewModel {
  editor: ReturnType<typeof useJournalEditor>;
  simpleEditor: ReturnType<typeof useSimpleJournalEditor>;
  accounts: ReturnType<typeof useAccounts>['accounts'];
  activeMode: 'guided' | 'advanced' | 'bulk';
  onToggleMode: (mode: 'guided' | 'advanced' | 'bulk') => void;
  bulkEditor: ReturnType<typeof useBulkJournalEditor>;
  savedSummary: { count: number; items: SavedJournalSummary[] } | null;
  setSavedSummary: (summary: { count: number; items: SavedJournalSummary[] } | null) => void;
  isLoading: boolean;
  headerTitle: string;
  showEditBanner: boolean;
  editBannerText: string;
  isGuidedMode: boolean;
  onToggleGuidedMode: (mode: boolean) => void;
  showAccountPicker: boolean;
  onCloseAccountPicker: () => void;
  onSelectAccountRequest: (lineId: string) => void;
  onAccountSelected: (accountId: AccountId) => void;
  selectedAccountId?: AccountId;
  simpleFormIsValid: boolean;
  advancedFormIsValid: boolean;
  advancedFormConfig: {
    onSelectAccountRequest: (lineId: string) => void;
  };
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
  launchSource?: string;
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
    initialMode: route.mode === 'bulk' ? undefined : route.mode,
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

  const isSimpleModeDisabled = editor.lines.length > 2;

  const { suggestions } = useJournalSuggestions(workplaceId, editor.description);

  const {
    showAccountPicker,
    activeLineId,
    onSelectAccountRequest,
    onCloseAccountPicker,
    onAccountSelected,
    onCreateAccountRequest,
    selectableAccounts,
  } = useJournalEntryAccountSelection({ accounts, editor });

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

  const [activeMode, setActiveMode] = useState<'guided' | 'advanced' | 'bulk'>(() =>
    resolveJournalEntryScreenMode(route.mode),
  );

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

  const onToggleMode = useCallback(
    (mode: 'guided' | 'advanced' | 'bulk') => {
      if (mode === 'guided' && isSimpleModeDisabled) {
        showErrorAlert(AppConfig.strings.validation.simpleModeTooManyLines, undefined, __DEV__);
        return;
      }
      setActiveMode(mode);
      if (mode === 'guided') {
        editor.setIsGuidedMode(true);
      } else if (mode === 'advanced') {
        editor.setIsGuidedMode(false);
      }
    },
    [editor, isSimpleModeDisabled, setActiveMode],
  );

  const [isAmountFocused, setIsAmountFocused] = useState(false);

  const onToggleGuidedMode = useCallback(
    (mode: boolean) => {
      if (mode && isSimpleModeDisabled) {
        showErrorAlert(AppConfig.strings.validation.simpleModeTooManyLines, undefined, __DEV__);
        return;
      }
      setActiveMode(mode ? 'guided' : 'advanced');
      editor.setIsGuidedMode(mode);
    },
    [editor, isSimpleModeDisabled, setActiveMode],
  );

  const headerTitle = useMemo(
    () =>
      resolveJournalEntryHeaderTitle({
        activeMode,
        isEdit: editor.isEdit,
        isGuidedMode: editor.isGuidedMode,
      }),
    [activeMode, editor.isEdit, editor.isGuidedMode],
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
    availableCurrencies,
    selectedCurrency,
    setSelectedCurrency,
  } = useAdvancedJournalSummary(editor.lines);

  const primaryDisplayCurrency = useMemo(() => {
    if (editor.isGuidedMode) return simpleEditor.displayCurrency;

    const firstLineCurrency = editor.lines[0]?.accountCurrency;
    if (firstLineCurrency) return firstLineCurrency;

    const lineWithCurrency = editor.lines.find(l => !!l.accountCurrency);
    if (lineWithCurrency?.accountCurrency) return lineWithCurrency.accountCurrency;

    return workplaceCurrency;
  }, [editor.isGuidedMode, editor.lines, simpleEditor.displayCurrency, workplaceCurrency]);

  const primaryDisplayAmount = useMemo(() => {
    if (editor.isGuidedMode) return simpleEditor.amount;
    return JournalCalculator.roundAmount(totalDebits).toFixed(2);
  }, [editor.isGuidedMode, simpleEditor.amount, totalDebits]);

  const isAdvancedValid = isAdvancedJournalFormValid({
    isBalanced,
    description: editor.description,
    lines: editor.lines,
    isSubmitting: editor.isSubmitting,
  });

  const handleSubmit = useCallback(() => {
    if (activeMode === 'bulk') {
      bulkEditor.saveAll();
    } else if (editor.isGuidedMode) {
      if (isAmountFocused && !isSimpleValid) {
        Keyboard.dismiss();
      } else {
        simpleEditor.handleSave();
      }
    } else {
      editor.submit();
    }
  }, [activeMode, bulkEditor, editor, isAmountFocused, isSimpleValid, simpleEditor]);

  const isSubmitDisabled = useMemo(
    () =>
      isJournalEntrySubmitDisabled({
        activeMode,
        bulkSubmitting: bulkEditor.isSubmitting,
        bulkValid: bulkEditor.isValid,
        isGuidedMode: editor.isGuidedMode,
        isAmountFocused,
        isSimpleValid,
        isAdvancedValid,
      }),
    [
      activeMode,
      bulkEditor.isSubmitting,
      bulkEditor.isValid,
      editor.isGuidedMode,
      isAmountFocused,
      isSimpleValid,
      isAdvancedValid,
    ],
  );

  const submitLabel = useMemo(
    () =>
      resolveJournalEntrySubmitLabel({
        activeMode,
        bulkSubmitting: bulkEditor.isSubmitting,
        bulkRowCount: bulkEditor.rows.length,
        isGuidedMode: editor.isGuidedMode,
        isAmountFocused,
        isSimpleValid,
        simpleSubmitting: simpleEditor.isSubmitting,
        simpleType: simpleEditor.type,
        isEdit: editor.isEdit,
        isSubmitting: editor.isSubmitting,
      }),
    [
      activeMode,
      bulkEditor.isSubmitting,
      bulkEditor.rows.length,
      editor.isGuidedMode,
      editor.isSubmitting,
      editor.isEdit,
      isAmountFocused,
      isSimpleValid,
      simpleEditor.isSubmitting,
      simpleEditor.type,
    ],
  );

  return {
    editor,
    simpleEditor,
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
    isGuidedMode: editor.isGuidedMode,
    onToggleGuidedMode,
    showAccountPicker,
    onCloseAccountPicker,
    onSelectAccountRequest,
    onAccountSelected,
    selectedAccountId: editor.lines.find(l => l.id === activeLineId)?.accountId,
    simpleFormIsValid: isSimpleValid,
    advancedFormIsValid: isAdvancedValid,
    advancedFormConfig: {
      onSelectAccountRequest,
    },
    selectableAccounts,
    isSimpleModeDisabled,
    isBalanced,
    isBalancedDisplay,
    primaryDisplayAmount,
    primaryDisplayCurrency,
    availableCurrencies,
    selectedCurrency,
    onSelectCurrency: setSelectedCurrency,
    totalDebits,
    totalCredits,
    launchSource: route.launchSource,
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
