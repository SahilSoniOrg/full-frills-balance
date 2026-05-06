import { CreateAccountIntent } from '@/src/components/common/AccountPickerModal';
import { AppConfig } from '@/src/constants';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import Account, { AccountType } from '@/src/data/models/Account';
import { useAccounts } from '@/src/features/accounts';
import { useAdvancedJournalSummary } from '@/src/features/journal/entry/hooks/useAdvancedJournalSummary';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { useSimpleJournalEditor } from '@/src/features/journal/entry/hooks/useSimpleJournalEditor';
import { useJournalSuggestions } from '@/src/features/journal/hooks/useJournalSuggestions';
import { JournalCalculator } from '@/src/services/accounting/JournalCalculator';
import { smsService } from '@/src/services/sms-service';
import { AccountId, AccountRole, JournalId } from '@/src/types/domain';
import { getAllowedAccountTypes, getInferredAccountType } from '@/src/utils/accountCategory';
import { showErrorAlert } from '@/src/utils/alerts';
import { AppNavigation } from '@/src/utils/navigation';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Keyboard } from 'react-native';

/**
 * JournalEntryViewModel - Public interface for the Journal Entry screen state.
 */
export interface JournalEntryViewModel {
  editor: ReturnType<typeof useJournalEditor>;
  simpleEditor: ReturnType<typeof useSimpleJournalEditor>;
  accounts: ReturnType<typeof useAccounts>['accounts'];
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
  launchSource?: string;
  onCreateAccountRequest: (intent: CreateAccountIntent) => void;
  submitLabel: string;
  isSubmitDisabled: boolean;
  handleSubmit: () => void;
  isAmountFocused: boolean;
  setIsAmountFocused: (focused: boolean) => void;
  suggestions: string[];
}

/**
 * useJournalEntryViewModel - Orchestrates the Journal Entry screen.
 * Addresses several findings:
 * - FINDING-002: Theme is consumed inside the hook for internal styles only, not passed to props.
 * - FINDING-016: Decoupled from form components via separate config objects.
 * - FINDING-004: Centralized navigation via AppNavigation utility.
 */
export function useJournalEntryViewModel(): JournalEntryViewModel {
  const params = useLocalSearchParams();
  const { workplaceId, defaultCurrencyCode: workplaceCurrency } = useWorkplace();
  const initialMode =
    params.mode === 'simple' || params.mode === 'advanced' ? params.mode : undefined;
  const initialType =
    params.type === 'expense' || params.type === 'income' || params.type === 'transfer'
      ? params.type
      : undefined;
  const initialSourceAccountId =
    typeof params.sourceAccountId === 'string'
      ? (params.sourceAccountId as AccountId)
      : typeof params.sourceId === 'string'
        ? (params.sourceId as AccountId)
        : undefined;
  const initialDestinationAccountId =
    typeof params.destinationAccountId === 'string'
      ? (params.destinationAccountId as AccountId)
      : typeof params.destinationId === 'string'
        ? (params.destinationId as AccountId)
        : undefined;

  const { accounts, isLoading: isLoadingAccounts } = useAccounts(workplaceId);

  const smsId = params.smsId as string | undefined;
  const smsRecordId = params.smsRecordId as string | undefined;

  const editor = useJournalEditor(workplaceId, {
    journalId: params.journalId as JournalId,
    initialMode,
    initialType,
    initialAmount: params.amount as string,
    initialDescription: params.notes as string,
    smsId,
    smsRecordId,
    smsSender: params.smsSender as string,
    rawSmsBody: params.rawSmsBody as string,
    initialDate: params.initialDate as string,
    initialSourceId: initialSourceAccountId,
    initialDestinationId: initialDestinationAccountId,
    // M-9 fix: sms processing is a screen-level concern, not a journal editor concern.
    // The hook calls this callback after a successful save without knowing what it does.
    onAfterSave: smsRecordId
      ? async result => {
          if (result.journalId) {
            await smsService.finalizeManualImport(smsRecordId, result.journalId);
          }
          if (smsId) {
            await smsService.markSmsAsProcessed(smsId);
          }
        }
      : smsId
        ? async () => smsService.markSmsAsProcessed(smsId)
        : undefined,
    onSuccess: () => AppNavigation.back(),
  });

  const { suggestions } = useJournalSuggestions(workplaceId, editor.description);

  // Editor for Simple Mode
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

  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [isAmountFocused, setIsAmountFocused] = useState(false);

  const onSelectAccountRequest = useCallback(
    (idOrRole: string) => {
      setActiveLineId(editor.resolveActiveLineId(idOrRole));
      setShowAccountPicker(true);
    },
    [editor],
  );

  const onCloseAccountPicker = useCallback(() => {
    setShowAccountPicker(false);
    setActiveLineId(null);
  }, []);

  const onAccountSelected = useCallback(
    (accountId: AccountId) => {
      if (activeLineId) {
        const account = accounts.find(a => a.id === accountId);
        if (account) {
          editor.updateLine(activeLineId, {
            accountId,
            accountName: account.name,
            accountType: account.accountType,
            accountCurrency: account.currencyCode,
          });
        }
      }
      setShowAccountPicker(false);
      setActiveLineId(null);
    },
    [accounts, activeLineId, editor],
  );

  const onCreateAccountRequest = useCallback(
    (intent: CreateAccountIntent) => {
      onCloseAccountPicker();

      let inferredType: AccountType | undefined;
      const activeLine = editor.lines.find(l => l.id === activeLineId);

      if (editor.isGuidedMode && activeLine) {
        inferredType = getInferredAccountType(editor.transactionType, activeLine.transactionType);
      }

      AppNavigation.toAccountForm(undefined, {
        name: intent.suggestedName,
        type: intent.type || inferredType,
      });
    },
    [activeLineId, editor.isGuidedMode, editor.transactionType, editor.lines, onCloseAccountPicker],
  );

  const selectableAccounts = useMemo(() => {
    if (!activeLineId) return accounts;

    // In Simple mode, we strictly filter based on Rule 1 & 4 from principles.md
    if (editor.isGuidedMode) {
      const type = editor.transactionType;
      const line = editor.lines.find(l => l.id === activeLineId);
      if (!line) return accounts;

      const allowedTypes = getAllowedAccountTypes(type, line.transactionType);
      const filtered = accounts.filter(a => allowedTypes.includes(a.accountType));

      // Safety Fallback: If filtering by specific types returns nothing,
      // show all accounts so the user isn't stuck with an empty modal.
      return filtered.length > 0 ? filtered : accounts;
    }

    // In Advanced mode, return all accounts to allow full flexibility
    return accounts;
  }, [accounts, activeLineId, editor.isGuidedMode, editor.transactionType, editor.lines]);

  const isSimpleModeDisabled = editor.lines.length > 2;

  const onToggleGuidedMode = useCallback(
    (mode: boolean) => {
      if (mode && isSimpleModeDisabled) {
        showErrorAlert(AppConfig.strings.validation.simpleModeTooManyLines, undefined, __DEV__);
        return;
      }

      editor.setIsGuidedMode(mode);
    },
    [editor, isSimpleModeDisabled],
  );

  const headerTitle = useMemo(() => {
    if (editor.isEdit) return AppConfig.strings.transactionFlow.headers.edit;
    return editor.isGuidedMode
      ? AppConfig.strings.transactionFlow.headers.new
      : AppConfig.strings.transactionFlow.headers.default;
  }, [editor.isEdit, editor.isGuidedMode]);

  // Calculate Validations
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
    availableCurrencies,
    selectedCurrency,
    setSelectedCurrency,
  } = useAdvancedJournalSummary(editor.lines);

  const primaryDisplayCurrency = useMemo(() => {
    // For Simple Mode, strictly use the curated displayCurrency from simpleEditor
    if (editor.isGuidedMode) return simpleEditor.displayCurrency;

    // For Advanced Mode, prioritize the first leg's currency as per Rule 1 & 4
    const firstLineCurrency = editor.lines[0]?.accountCurrency;
    if (firstLineCurrency) return firstLineCurrency;

    // Fallback to any line with currency
    const lineWithCurrency = editor.lines.find(l => !!l.accountCurrency);
    if (lineWithCurrency?.accountCurrency) return lineWithCurrency.accountCurrency;

    // Final fallback
    return workplaceCurrency;
  }, [editor.isGuidedMode, editor.lines, simpleEditor.displayCurrency, workplaceCurrency]);

  const primaryDisplayAmount = useMemo(() => {
    if (editor.isGuidedMode) return simpleEditor.amount;

    // In Advanced Mode, we calculate the footer amount in primaryDisplayCurrency
    // This keeps the footer stable while the user toggles the summary box.
    const defaultCurrency = workplaceCurrency;

    // Hoist primaryCurrencyLine lookup out of reduce to be O(1) inside loop
    const primaryCurrencyLine = editor.lines.find(
      l => l.accountCurrency === primaryDisplayCurrency,
    );
    const primaryRate = primaryCurrencyLine
      ? typeof primaryCurrencyLine.exchangeRate === 'string'
        ? parseFloat(primaryCurrencyLine.exchangeRate)
        : primaryCurrencyLine.exchangeRate
      : 1;

    const debitTotalInPrimary = editor.lines
      .filter(l => l.transactionType === 'DEBIT')
      .reduce((sum, line) => {
        const baseAmount = JournalCalculator.getLineBaseAmount(
          {
            amount: line.amount,
            exchangeRate: line.exchangeRate,
            accountCurrency: line.accountCurrency,
          },
          defaultCurrency,
        );

        if (primaryDisplayCurrency === defaultCurrency) return sum + baseAmount;

        const finalAmount =
          primaryRate && primaryRate > 0 ? baseAmount / (primaryRate as number) : baseAmount;
        return sum + finalAmount;
      }, 0);

    return JournalCalculator.roundAmount(debitTotalInPrimary).toFixed(2);
  }, [editor.isGuidedMode, simpleEditor.amount, editor.lines, primaryDisplayCurrency]);

  const hasDescription = editor.description.trim().length > 0;
  const hasIncompleteLines = editor.lines.some(line => !line.accountId || !line.amount.trim());
  const isAdvancedValid =
    isBalanced && hasDescription && !hasIncompleteLines && !editor.isSubmitting;

  const handleSubmit = useCallback(() => {
    if (editor.isGuidedMode) {
      if (isAmountFocused && !isSimpleValid) {
        Keyboard.dismiss();
      } else {
        simpleEditor.handleSave();
      }
    } else {
      editor.submit();
    }
  }, [editor, isAmountFocused, isSimpleValid, simpleEditor]);

  const isSubmitDisabled = editor.isGuidedMode
    ? isAmountFocused
      ? false
      : !isSimpleValid
    : !isAdvancedValid;

  const submitLabel = useMemo(() => {
    if (editor.isGuidedMode) {
      if (isAmountFocused && !isSimpleValid) {
        return AppConfig.strings.transactionFlow.continue;
      }
      return simpleEditor.isSubmitting
        ? AppConfig.strings.transactionFlow.saving
        : AppConfig.strings.transactionFlow.save(simpleEditor.type);
    }

    if (editor.isSubmitting) {
      return editor.isEdit
        ? AppConfig.strings.advancedEntry.updating
        : AppConfig.strings.advancedEntry.creating;
    }

    return editor.isEdit
      ? AppConfig.strings.advancedEntry.updateJournal
      : AppConfig.strings.advancedEntry.createJournal;
  }, [
    editor.isGuidedMode,
    editor.isSubmitting,
    editor.isEdit,
    isAmountFocused,
    isSimpleValid,
    simpleEditor.isSubmitting,
    simpleEditor.type,
  ]);

  return useMemo(
    () => ({
      editor,
      simpleEditor,
      accounts,
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
      primaryDisplayAmount,
      primaryDisplayCurrency,
      availableCurrencies,
      selectedCurrency,
      onSelectCurrency: setSelectedCurrency,
      totalDebits,
      totalCredits,
      launchSource: typeof params.source === 'string' ? params.source : undefined,
      onCreateAccountRequest,
      submitLabel,
      isSubmitDisabled,
      handleSubmit,
      isAmountFocused,
      setIsAmountFocused,
      suggestions,
    }),
    [
      editor,
      simpleEditor,
      accounts,
      isLoadingAccounts,
      headerTitle,
      onToggleGuidedMode,
      showAccountPicker,
      onCloseAccountPicker,
      onSelectAccountRequest,
      onAccountSelected,
      activeLineId,
      isSimpleValid,
      isAdvancedValid,
      selectableAccounts,
      isSimpleModeDisabled,
      isBalanced,
      primaryDisplayAmount,
      primaryDisplayCurrency,
      availableCurrencies,
      selectedCurrency,
      setSelectedCurrency,
      totalDebits,
      totalCredits,
      params.source,
      onCreateAccountRequest,
      submitLabel,
      isSubmitDisabled,
      handleSubmit,
      isAmountFocused,
      suggestions,
    ],
  );
}
