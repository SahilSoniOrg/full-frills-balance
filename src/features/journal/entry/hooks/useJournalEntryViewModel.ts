import { AppConfig } from '@/src/constants';
import { useAccounts } from '@/src/features/accounts';
import { useAdvancedJournalSummary } from '@/src/features/journal/entry/hooks/useAdvancedJournalSummary';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { useSimpleJournalEditor } from '@/src/features/journal/entry/hooks/useSimpleJournalEditor';
import { showErrorAlert } from '@/src/utils/alerts';
import { AppNavigation } from '@/src/utils/navigation';
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
    });

    // Editor for Simple Mode
    const simpleEditor = useSimpleJournalEditor({
        accounts,
        onSuccess: () => AppNavigation.back(),
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

    const { isBalanced } = useAdvancedJournalSummary(editor.lines);
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
    };
}
