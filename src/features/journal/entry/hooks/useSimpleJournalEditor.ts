import Account, { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { useAccountSelection } from '@/src/features/journal/hooks/useAccountSelection';
import { useExchangeRate } from '@/src/hooks/useExchangeRate';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useJournalEditor } from './useJournalEditor';

export type TabType = 'expense' | 'income' | 'transfer';

export interface UseSimpleJournalEditorProps {
    accounts: Account[];
    onSuccess: () => void;
    editor: ReturnType<typeof useJournalEditor>;
}

/**
 * useSimpleJournalEditor - Controller hook for the simple journal form.
 * Handles state, basic validation, and exchange rate calculations.
 * 
 * REFACTORED: Now uses `editor` as the single source of truth for transaction state.
 */
export function useSimpleJournalEditor({
    accounts,
    onSuccess,
    editor,
}: UseSimpleJournalEditorProps) {
    const { fetchRate } = useExchangeRate();

    const [exchangeRate, setExchangeRate] = useState<number | null>(null);
    const [isLoadingRate, setIsLoadingRate] = useState(false);
    const [rateError, setRateError] = useState<string | null>(null);

    // Derived State from Editor
    const type = editor.transactionType;

    const sourceLine = editor.lines.find(l => l.transactionType === TransactionType.CREDIT) || editor.lines[1];
    const destinationLine = editor.lines.find(l => l.transactionType === TransactionType.DEBIT) || editor.lines[0];

    const amount = sourceLine?.amount || '';
    const sourceId = sourceLine?.accountId || '';
    const destinationId = destinationLine?.accountId || '';

    // Use shared account selection logic for filtering
    const {
        transactionAccounts,
        expenseAccounts,
        incomeAccounts,
    } = useAccountSelection({ accounts });

    const sourceAccount = useMemo(() => accounts.find(a => a.id === sourceId), [accounts, sourceId]);
    const destAccount = useMemo(() => accounts.find(a => a.id === destinationId), [accounts, destinationId]);

    const sourceCurrency = useMemo(() => sourceAccount?.currencyCode, [sourceAccount]);
    const destCurrency = useMemo(() => destAccount?.currencyCode, [destAccount]);

    const isCrossCurrency = !!(sourceCurrency && destCurrency && sourceCurrency !== destCurrency);

    // Rate calculations
    useEffect(() => {
        const fetchCurrentRate = async () => {
            if (!isCrossCurrency || !sourceCurrency || !destCurrency) {
                setExchangeRate(null);
                return;
            }

            setIsLoadingRate(true);
            setRateError(null);
            try {
                const rate = await fetchRate(sourceCurrency, destCurrency);
                setExchangeRate(rate);
            } catch (error) {
                setRateError('Rate unavailable');
                logger.error('Failed to fetch rate', { sourceCurrency, destCurrency, error });
            } finally {
                setIsLoadingRate(false);
            }
        };

        fetchCurrentRate();
    }, [isCrossCurrency, sourceCurrency, destCurrency, fetchRate]);

    const numAmount = useMemo(() => {
        return parseFloat(amount.replace(/[^0-9.]/g, '')) || 0;
    }, [amount]);

    const convertedAmount = useMemo(() => {
        if (!isCrossCurrency || !exchangeRate) return numAmount;
        return numAmount * exchangeRate;
    }, [numAmount, isCrossCurrency, exchangeRate]);

    // Helpers to update editor state
    const setType = (newType: 'expense' | 'income' | 'transfer') => {
        editor.setTransactionType(newType);

        // Clear accounts on type change to avoid invalid states
        if (sourceLine) editor.updateLine(sourceLine.id, { accountId: '', accountName: '', accountType: AccountType.ASSET, accountCurrency: undefined });
        if (destinationLine) editor.updateLine(destinationLine.id, { accountId: '', accountName: '', accountType: AccountType.ASSET, accountCurrency: undefined });
    };

    const setAmount = (newAmount: string) => {
        // Update both lines
        if (sourceLine) editor.updateLine(sourceLine.id, { amount: newAmount });
        if (destinationLine) editor.updateLine(destinationLine.id, { amount: newAmount });
    };

    const setSourceId = (id: string) => {
        const account = accounts.find(a => a.id === id);
        if (sourceLine) {
            editor.updateLine(sourceLine.id, {
                accountId: id,
                accountName: account?.name || '',
                accountType: account?.accountType || AccountType.ASSET,
                accountCurrency: account?.currencyCode
            });
        }
    };

    const setDestinationId = (id: string) => {
        const account = accounts.find(a => a.id === id);
        if (destinationLine) {
            editor.updateLine(destinationLine.id, {
                accountId: id,
                accountName: account?.name || '',
                accountType: account?.accountType || AccountType.ASSET,
                accountCurrency: account?.currencyCode
            });
        }
    };

    // Account defaulting logic (re-implemented to work with editor state)
    useEffect(() => {
        const lastSourceId = preferences.lastUsedSourceAccountId;
        const lastDestId = preferences.lastUsedDestinationAccountId;

        // Only default if empty
        if (!sourceId && lastSourceId && transactionAccounts.some(a => a.id === lastSourceId)) {
            if (type === 'transfer' || type === 'expense') {
                setSourceId(lastSourceId);
            }
        }

        if (!destinationId && lastDestId && transactionAccounts.some(a => a.id === lastDestId)) {
            if (type === 'transfer' || type === 'income') {
                setDestinationId(lastDestId);
            }
        }
    }, [type, transactionAccounts]); // Run when type changes or accounts load


    const handleSave = useCallback(async () => {
        if (numAmount <= 0) return;
        if (!sourceId || !destinationId) return;

        // Save preferences
        if (type === 'expense' || type === 'transfer') await preferences.setLastUsedSourceAccountId(sourceId);
        if (type === 'income' || type === 'transfer') await preferences.setLastUsedDestinationAccountId(destinationId);

        // Inject exchange rate into source line (if cross currency)
        if (isCrossCurrency && exchangeRate && sourceLine) {
            editor.updateLine(sourceLine.id, { exchangeRate: exchangeRate.toString() });
        }

        // Use the main editor submit
        await editor.submit();
        onSuccess();
    }, [numAmount, sourceId, destinationId, type, isCrossCurrency, exchangeRate, sourceLine, editor.submit, onSuccess, editor.updateLine]);

    return {
        type,
        setType,
        amount,
        setAmount,
        sourceId,
        setSourceId,
        destinationId,
        setDestinationId,
        // Passthrough props for UI compatibility
        journalDate: editor.journalDate,
        journalTime: editor.journalTime,
        description: editor.description,

        isSubmitting: editor.isSubmitting,
        exchangeRate,
        isLoadingRate,
        rateError,
        isCrossCurrency,
        convertedAmount,
        transactionAccounts,
        expenseAccounts,
        incomeAccounts,
        sourceAccount,
        destAccount,
        sourceCurrency,
        destCurrency,
        handleSave,
        isValidAmount: numAmount > 0,
    };
}
