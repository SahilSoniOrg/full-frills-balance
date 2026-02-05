import { useAccounts } from '@/src/features/accounts';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { useTheme } from '@/src/hooks/use-theme';
import { showErrorAlert } from '@/src/utils/alerts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

export interface JournalEntryViewModel {
    theme: ReturnType<typeof useTheme>['theme'];
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
    simpleFormProps: {
        accounts: ReturnType<typeof useAccounts>['accounts'];
        journalId?: string;
        onSuccess: () => void;
        initialType?: any;
        initialAmount?: any;
        initialDestinationId?: any;
        initialSourceId?: any;
        initialDate?: any;
        initialTime?: any;
        initialDescription?: any;
    };
    advancedFormProps: {
        accounts: ReturnType<typeof useAccounts>['accounts'];
        editor: ReturnType<typeof useJournalEditor>;
        onSelectAccountRequest: (lineId: string) => void;
    };
}

export function useJournalEntryViewModel(): JournalEntryViewModel {
    const { theme } = useTheme();
    const params = useLocalSearchParams();
    const router = useRouter();

    const editor = useJournalEditor({
        journalId: params.journalId as string,
        initialMode: params.mode as any,
        initialType: params.type as any,
    });

    const { accounts, isLoading: isLoadingAccounts } = useAccounts();
    const [showAccountPicker, setShowAccountPicker] = useState(false);
    const [activeLineId, setActiveLineId] = useState<string | null>(null);

    const onSelectAccountRequest = useCallback((lineId: string) => {
        setActiveLineId(lineId);
        setShowAccountPicker(true);
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
        theme,
        editor,
        accounts,
        isLoading: isLoadingAccounts || editor.isLoading,
        headerTitle,
        showEditBanner: editor.isEdit,
        editBannerText: 'You are modifying an existing transaction',
        isGuidedMode: editor.isGuidedMode,
        onToggleGuidedMode,
        showAccountPicker,
        onCloseAccountPicker: () => setShowAccountPicker(false),
        onSelectAccountRequest,
        onAccountSelected,
        simpleFormProps: {
            accounts,
            journalId: params.journalId as string,
            onSuccess: () => router.back(),
            initialType: editor.transactionType,
            initialAmount: editor.lines[0]?.amount,
            initialDestinationId: editor.lines[0]?.accountId,
            initialSourceId: editor.lines[1]?.accountId,
            initialDate: editor.journalDate,
            initialTime: editor.journalTime,
            initialDescription: editor.description,
        },
        advancedFormProps: {
            accounts,
            editor,
            onSelectAccountRequest,
        }
    };
}
