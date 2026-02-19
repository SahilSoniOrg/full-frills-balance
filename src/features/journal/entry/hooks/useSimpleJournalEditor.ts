import { AppConfig } from '@/src/constants';
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

    const sourceLine = useMemo(() => editor.lines.find(l => l.transactionType === TransactionType.CREDIT), [editor.lines]);
    const destinationLine = useMemo(() => editor.lines.find(l => l.transactionType === TransactionType.DEBIT), [editor.lines]);

    const amount = sourceLine?.amount || destinationLine?.amount || '';
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

    // Sync exchange rate and converted amounts back to lines for Advanced mode consistency
    useEffect(() => {
        if (editor.isGuidedMode === false) return; // DO NOT sync in Advanced Mode
        if (!sourceLine || !destinationLine) return;

        if (isCrossCurrency && exchangeRate) {
            // Apply exchange rate to source line
            if (sourceLine.exchangeRate !== exchangeRate.toString()) {
                editor.updateLine(sourceLine.id, { exchangeRate: exchangeRate.toString() });
            }
            // Apply converted amount to destination line
            const formattedConverted = convertedAmount.toFixed(2);
            if (destinationLine.amount !== formattedConverted) {
                editor.updateLine(destinationLine.id, { amount: formattedConverted });
            }
        } else {
            // Reset if not cross-currency
            if (sourceLine.exchangeRate) {
                editor.updateLine(sourceLine.id, { exchangeRate: '' });
            }
            // Ensure amounts match if no conversion
            if (destinationLine.amount !== amount) {
                editor.updateLine(destinationLine.id, { amount });
            }
        }
    }, [exchangeRate, isCrossCurrency, sourceLine, destinationLine, convertedAmount, amount, editor.updateLine]);

    // Helpers to update editor state
    const setType = (newType: 'expense' | 'income' | 'transfer') => {
        editor.setTransactionType(newType);

        // Simple mode always assumes 2 lines. Let's ensure they have the correct roles.
        // Expense: Source (Credit: Asset/Liab) -> Dest (Debit: Expense)
        // Income: Source (Credit: Income) -> Dest (Debit: Asset/Liab)
        // Transfer: Source (Credit: Asset/Liab) -> Dest (Debit: Asset/Liab)

        if (sourceLine) {
            editor.updateLine(sourceLine.id, {
                transactionType: TransactionType.CREDIT,
                accountId: '',
                accountName: '',
                accountType: newType === 'income' ? AccountType.INCOME : AccountType.ASSET,
                accountCurrency: undefined
            });
        }
        if (destinationLine) {
            editor.updateLine(destinationLine.id, {
                transactionType: TransactionType.DEBIT,
                accountId: '',
                accountName: '',
                accountType: newType === 'expense' ? AccountType.EXPENSE : AccountType.ASSET,
                accountCurrency: undefined
            });
        }
    };

    const setAmount = (newAmount: string) => {
        // Update both lines - the effect will handle the cross-currency conversion
        if (sourceLine) editor.updateLine(sourceLine.id, { amount: newAmount });
        if (destinationLine && !isCrossCurrency) editor.updateLine(destinationLine.id, { amount: newAmount });
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

        // Default description to type if empty
        if (!editor.description.trim()) {
            editor.setDescription(type.charAt(0).toUpperCase() + type.slice(1));
        }

        // Save preferences
        if (type === 'expense' || type === 'transfer') await preferences.setLastUsedSourceAccountId(sourceId);
        if (type === 'income' || type === 'transfer') await preferences.setLastUsedDestinationAccountId(destinationId);

        // Use the main editor submit
        await editor.submit();
        onSuccess();
    }, [numAmount, sourceId, destinationId, type, editor.description, editor.submit, editor.setDescription, onSuccess]);

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
        displayCurrency: sourceCurrency || destCurrency || preferences.defaultCurrencyCode || AppConfig.defaultCurrency,
        handleSave,
        isValidAmount: numAmount > 0,
    };
}
