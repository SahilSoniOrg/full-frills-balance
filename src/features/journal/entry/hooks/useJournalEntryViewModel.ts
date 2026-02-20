import { AppConfig } from '@/src/constants';
import { useAccounts } from '@/src/features/accounts';
import { useAdvancedJournalSummary } from '@/src/features/journal/entry/hooks/useAdvancedJournalSummary';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { useSimpleJournalEditor } from '@/src/features/journal/entry/hooks/useSimpleJournalEditor';
import { JournalCalculator } from '@/src/services/accounting/JournalCalculator';
import { showErrorAlert } from '@/src/utils/alerts';
import { AppNavigation } from '@/src/utils/navigation';
import { preferences } from '@/src/utils/preferences';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

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
    onAccountSelected: (accountId: string) => void;
    selectedAccountId?: string;
    simpleFormIsValid: boolean;
    advancedFormIsValid: boolean;
    advancedFormConfig: {
        onSelectAccountRequest: (lineId: string) => void;
    };
    isSimpleModeDisabled: boolean;
    primaryDisplayAmount: string;
    primaryDisplayCurrency: string;
    availableCurrencies: string[];
    selectedCurrency: string;
    onSelectCurrency: (currency: string) => void;
    totalDebits: number;
    totalCredits: number;
    isBalanced: boolean;
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
    const initialMode = params.mode === 'simple' || params.mode === 'advanced' ? params.mode : undefined;
    const initialType = params.type === 'expense' || params.type === 'income' || params.type === 'transfer' ? params.type : undefined;

    const { accounts, isLoading: isLoadingAccounts } = useAccounts();

    const editor = useJournalEditor({
        journalId: params.journalId as string,
        initialMode,
        initialType,
        onSuccess: () => AppNavigation.back(),
    });

    // Editor for Simple Mode
    const simpleEditor = useSimpleJournalEditor({
        accounts,
        editor,
    });

    const [showAccountPicker, setShowAccountPicker] = useState(false);
    const [activeLineId, setActiveLineId] = useState<string | null>(null);

    const onSelectAccountRequest = useCallback((lineId: string) => {
        setActiveLineId(lineId);
        setShowAccountPicker(true);
    }, []);

    const onCloseAccountPicker = useCallback(() => {
        setShowAccountPicker(false);
        setActiveLineId(null);
    }, []);

    const onAccountSelected = useCallback((accountId: string) => {
        if (activeLineId) {
            const account = accounts.find(a => a.id === accountId);
            if (account) {
                editor.updateLine(activeLineId, {
                    accountId,
                    accountName: account.name,
                    accountType: account.accountType,
                    accountCurrency: account.currencyCode
                });
            }
        }
        setShowAccountPicker(false);
        setActiveLineId(null);
    }, [accounts, activeLineId, editor]);

    const isSimpleModeDisabled = editor.lines.length > 2;

    const onToggleGuidedMode = useCallback((mode: boolean) => {
        if (mode && isSimpleModeDisabled) {
            showErrorAlert(AppConfig.strings.validation.simpleModeTooManyLines, undefined, true);
            return;
        }

        editor.setIsGuidedMode(mode);
    }, [editor, isSimpleModeDisabled]);

    const headerTitle = useMemo(() => {
        if (editor.isEdit) return AppConfig.strings.transactionFlow.headers.edit;
        return editor.isGuidedMode ? AppConfig.strings.transactionFlow.headers.new : AppConfig.strings.transactionFlow.headers.default;
    }, [editor.isEdit, editor.isGuidedMode]);

    // Calculate Validations
    const isSimpleValid = simpleEditor.isValidAmount && !!simpleEditor.sourceId && !!simpleEditor.destinationId &&
        (simpleEditor.sourceId !== simpleEditor.destinationId) && !simpleEditor.isSubmitting &&
        !simpleEditor.isLoadingRate && !simpleEditor.rateError;

    const { totalDebits, totalCredits, isBalanced, availableCurrencies, selectedCurrency, setSelectedCurrency } = useAdvancedJournalSummary(editor.lines);

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
        return preferences.defaultCurrencyCode || AppConfig.defaultCurrency;
    }, [editor.isGuidedMode, editor.lines, simpleEditor.displayCurrency]);

    const primaryDisplayAmount = useMemo(() => {
        if (editor.isGuidedMode) return simpleEditor.amount;

        // In Advanced Mode, we calculate the footer amount in primaryDisplayCurrency
        // This keeps the footer stable while the user toggles the summary box.
        const defaultCurrency = preferences.defaultCurrencyCode || AppConfig.defaultCurrency;

        const debitTotalInPrimary = editor.lines
            .filter(l => l.transactionType === 'DEBIT')
            .reduce((sum, line) => {
                const baseAmount = JournalCalculator.getLineBaseAmount({
                    amount: line.amount,
                    exchangeRate: line.exchangeRate,
                    accountCurrency: line.accountCurrency
                });

                if (primaryDisplayCurrency === defaultCurrency) return sum + baseAmount;

                // Convert base -> primaryDisplayCurrency
                const primaryCurrencyLine = editor.lines.find(l => l.accountCurrency === primaryDisplayCurrency);
                const primaryRate = primaryCurrencyLine ? (typeof primaryCurrencyLine.exchangeRate === 'string' ? parseFloat(primaryCurrencyLine.exchangeRate) : primaryCurrencyLine.exchangeRate) : 1;

                const finalAmount = (primaryRate && primaryRate > 0) ? baseAmount / (primaryRate as number) : baseAmount;
                return sum + finalAmount;
            }, 0);

        return JournalCalculator.roundAmount(debitTotalInPrimary).toFixed(2);
    }, [editor.isGuidedMode, simpleEditor.amount, editor.lines, primaryDisplayCurrency]);

    const hasDescription = editor.description.trim().length > 0;
    const hasIncompleteLines = editor.lines.some(line => !line.accountId || !line.amount.trim());
    const isAdvancedValid = isBalanced && hasDescription && !hasIncompleteLines && !editor.isSubmitting;

    return {
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
        isSimpleModeDisabled,
        isBalanced,
        primaryDisplayAmount,
        primaryDisplayCurrency,
        availableCurrencies,
        selectedCurrency,
        onSelectCurrency: setSelectedCurrency,
        totalDebits,
        totalCredits,
    };
}
