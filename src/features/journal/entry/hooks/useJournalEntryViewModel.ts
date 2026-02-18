import { TransactionType } from '@/src/data/models/Transaction';
import { useAccounts } from '@/src/features/accounts';
import { SimpleFormProps } from '@/src/features/journal/entry/components/SimpleForm';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { showErrorAlert } from '@/src/utils/alerts';
import { AppNavigation } from '@/src/utils/navigation';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

/**
 * JournalEntryViewModel - Public interface for the Journal Entry screen state.
 */
export interface JournalEntryViewModel {
    editor: ReturnType<typeof useJournalEditor>;
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
    simpleFormConfig: SimpleFormProps;
    advancedFormConfig: {
        accounts: ReturnType<typeof useAccounts>['accounts'];
        editor: ReturnType<typeof useJournalEditor>;
        onSelectAccountRequest: (lineId: string) => void;
    };
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

    const editor = useJournalEditor({
        journalId: params.journalId as string,
        initialMode,
        initialType,
    });

    const { accounts, isLoading: isLoadingAccounts } = useAccounts();
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

    const onToggleGuidedMode = useCallback((mode: boolean) => {
        if (mode && editor.lines.length > 2) {
            showErrorAlert('Cannot switch to Simple mode with more than 2 transaction lines.');
            return;
        }
        editor.setIsGuidedMode(mode);
    }, [editor]);

    const headerTitle = useMemo(() => {
        if (editor.isEdit) return 'Edit Transaction';
        return editor.isGuidedMode ? 'New Transaction' : 'Journal Entry';
    }, [editor.isEdit, editor.isGuidedMode]);

    return {
        editor,
        accounts,
        isLoading: isLoadingAccounts || editor.isLoading,
        headerTitle,
        showEditBanner: editor.isEdit,
        editBannerText: 'You are modifying an existing transaction',
        isGuidedMode: editor.isGuidedMode,
        onToggleGuidedMode,
        showAccountPicker,
        onCloseAccountPicker,
        onSelectAccountRequest,
        onAccountSelected,
        selectedAccountId: editor.lines.find(l => l.id === activeLineId)?.accountId,
        simpleFormConfig: {
            accounts,
            journalId: params.journalId as string,
            onSuccess: () => AppNavigation.back(),
            initialType: editor.transactionType,
            initialAmount: editor.lines[0]?.amount,
            initialDestinationId: editor.lines.find(l => l.transactionType === TransactionType.DEBIT)?.accountId || editor.lines[0]?.accountId,
            initialSourceId: editor.lines.find(l => l.transactionType === TransactionType.CREDIT)?.accountId || editor.lines[1]?.accountId,
            initialDate: editor.journalDate,
            initialTime: editor.journalTime,
            initialDescription: editor.description,
        },
        advancedFormConfig: {
            accounts,
            editor,
            onSelectAccountRequest,
        }
    };
}
