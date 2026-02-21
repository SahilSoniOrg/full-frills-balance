import { AppConfig } from '@/src/constants';
import { useUI } from '@/src/contexts/UIContext';
import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { journalService } from '@/src/features/journal/services/JournalService';
import { transactionService } from '@/src/features/journal/services/TransactionService';
import { useExchangeRate } from '@/src/hooks/useExchangeRate';
import { JournalCalculator } from '@/src/services/accounting/JournalCalculator';
import { JournalEntryLine } from '@/src/types/domain';
import { showErrorAlert } from '@/src/utils/alerts';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';
import dayjs from 'dayjs';
import { useCallback, useEffect, useState } from 'react';

export interface UseJournalEditorOptions {
    journalId?: string;
    initialMode?: 'simple' | 'advanced';
    initialType?: 'expense' | 'income' | 'transfer';
    onSuccess?: () => void;
}

/**
 * useJournalEditor - Controller hook for the Journal Entry screen.
 * Consolidates state management and business logic for both simple and advanced modes.
 */
export function useJournalEditor(options: UseJournalEditorOptions = {}) {
    const { advancedMode, setAdvancedMode } = useUI();
    const { journalId, initialMode, initialType = 'expense' } = options;
    const { fetchRate } = useExchangeRate();

    /**
     * Initialize mode from explicit prop or user preference
     * - If initialMode is provided: use it (overrides preference)
     * - Otherwise: use the user's saved advancedMode preference
     */
    const [isGuidedMode, setIsGuidedMode] = useState(() => {
        if (initialMode) return initialMode === 'simple';
        return !advancedMode;
    });

    /**
     * Sync user's mode preference when they manually toggle
     * 
     * BEHAVIOR:
     * - When user toggles Simple ↔ Advanced, save their preference
     * - Only syncs if no explicit initialMode was provided
     * - initialMode (if present) acts as a one-time override, not a persistent preference
     * 
     * This ensures:
     * 1. Deep links can force a specific mode (via initialMode)
     * 2. User's manual toggles are remembered for next time
     * 3. The preference persists across app restarts
     */
    useEffect(() => {
        // Only sync if no explicit initialMode was provided (which overrides preference)
        if (!initialMode) {
            const newAdvancedMode = !isGuidedMode;
            if (newAdvancedMode !== advancedMode) {
                setAdvancedMode(newAdvancedMode);
            }
        }
    }, [isGuidedMode, advancedMode, setAdvancedMode, initialMode]);
    const [transactionType, setTransactionType] = useState<'expense' | 'income' | 'transfer'>(initialType);
    const isEdit = !!journalId;

    // Advanced / Generic state
    const [lines, setLines] = useState<JournalEntryLine[]>(() => [
        { id: '1', accountId: '', accountName: '', accountType: AccountType.ASSET, amount: '', transactionType: TransactionType.DEBIT, notes: '', exchangeRate: '' },
        { id: '2', accountId: '', accountName: '', accountType: AccountType.ASSET, amount: '', transactionType: TransactionType.CREDIT, notes: '', exchangeRate: '' },
    ]);

    const setGuidedModeInternal = useCallback((mode: boolean) => {
        if (mode) {
            // Normalizing to 2-leg structure if we have more than 2 lines, or if roles are missing
            setLines(current => {
                const debit = current.find(l => l.transactionType === TransactionType.DEBIT) || current[0];
                const credit = current.find(l => l.transactionType === TransactionType.CREDIT) || current[1];
                // Rule: Source (Credit) should be the first leg (index 0)
                return [
                    { ...credit, id: '1', transactionType: TransactionType.CREDIT },
                    { ...debit, id: '2', transactionType: TransactionType.DEBIT }
                ];
            });
        }
        setIsGuidedMode(mode);
    }, []);
    const [description, setDescription] = useState('');
    const [journalDate, setJournalDate] = useState(() => dayjs().format('YYYY-MM-DD'));
    const [journalTime, setJournalTime] = useState(() => dayjs().format('HH:mm'));
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoading, setIsLoading] = useState(isEdit);

    // Load initial data for edit mode
    useEffect(() => {
        if (journalId) {
            const loadData = async () => {
                setIsLoading(true);
                try {
                    const journal = await journalRepository.find(journalId);
                    if (journal) {
                        const dateObj = new Date(journal.journalDate);
                        setDescription(journal.description || '');
                        setJournalDate(dayjs(dateObj).format('YYYY-MM-DD'));
                        setJournalTime(dayjs(dateObj).format('HH:mm'));

                        const txs = await transactionService.getEnrichedByJournal(journalId);
                        if (txs.length > 0) {
                            // 1. Force Advanced Mode for multi-leg transactions
                            if (txs.length > 2) {
                                setGuidedModeInternal(false);
                            }
                            // 2. Refined Type Detection for 2-leg transactions
                            else if (txs.length === 2) {
                                const creditTx = txs.find(t => t.transactionType === TransactionType.CREDIT);
                                const debitTx = txs.find(t => t.transactionType === TransactionType.DEBIT);

                                if (creditTx && debitTx) {
                                    const sourceIsAssetLiab = creditTx.accountType === AccountType.ASSET || creditTx.accountType === AccountType.LIABILITY;
                                    const destIsExpense = debitTx.accountType === AccountType.EXPENSE;

                                    const sourceIsIncome = creditTx.accountType === AccountType.INCOME;
                                    const destIsAssetLiab = debitTx.accountType === AccountType.ASSET || debitTx.accountType === AccountType.LIABILITY;

                                    if (sourceIsAssetLiab && destIsExpense) {
                                        setTransactionType('expense');
                                    } else if (sourceIsIncome && destIsAssetLiab) {
                                        setTransactionType('income');
                                    } else {
                                        setTransactionType('transfer');
                                    }
                                }
                            }

                            setLines(txs.map(tx => ({
                                id: tx.id,
                                accountId: tx.accountId,
                                accountName: tx.accountName || '',
                                accountType: tx.accountType as AccountType,
                                amount: tx.amount.toString(),
                                transactionType: tx.transactionType as TransactionType,
                                notes: tx.notes || '',
                                exchangeRate: tx.exchangeRate ? tx.exchangeRate.toString() : '',
                                accountCurrency: tx.currencyCode
                            })));
                        }
                    }
                } catch {
                    showErrorAlert('Failed to load transaction');
                } finally {
                    setIsLoading(false);
                }
            };
            loadData();
        }
    }, [journalId, setGuidedModeInternal]);

    const addLine = useCallback(() => {
        setLines(prev => {
            const ids = prev.map(l => parseInt(l.id)).filter(id => !isNaN(id));
            const nextId = (ids.length > 0 ? Math.max(...ids) + 1 : prev.length + 1).toString();
            return [...prev, {
                id: nextId,
                accountId: '',
                accountName: '',
                accountType: AccountType.ASSET,
                amount: '',
                transactionType: TransactionType.DEBIT,
                notes: '',
                exchangeRate: ''
            }];
        });
    }, []);

    const removeLine = useCallback((id: string) => {
        setLines(prev => {
            if (prev.length <= 2) return prev;
            return prev.filter(l => l.id !== id);
        });
    }, []);

    const updateLine = useCallback((id: string, updates: Partial<JournalEntryLine>) => {
        setLines(prev => prev.map(line =>
            line.id === id ? { ...line, ...updates } : line
        ));
    }, []);

    const autoFetchLineRate = useCallback(async (id: string) => {
        const line = lines.find(l => l.id === id);
        if (!line || !line.accountCurrency) return;

        try {
            const defaultCurrency = preferences.defaultCurrencyCode || AppConfig.defaultCurrency;
            if (line.accountCurrency === defaultCurrency) {
                updateLine(id, { exchangeRate: '' });
                return;
            }

            const rate = await fetchRate(line.accountCurrency, defaultCurrency);
            updateLine(id, { exchangeRate: rate.toString() });
        } catch (error) {
            logger.error('Failed to auto-fetch rate for line', { id, error });
            showErrorAlert('Failed to fetch exchange rate');
        }
    }, [lines, fetchRate, updateLine]);

    const balanceLine = useCallback((id: string) => {
        const lineIndex = lines.findIndex(l => l.id === id);
        const line = lines[lineIndex];
        if (!line) return;

        const imbalance = JournalCalculator.calculateImbalance(lines.map(l => ({
            amount: l.amount,
            type: l.transactionType,
            exchangeRate: l.exchangeRate,
            accountCurrency: l.accountCurrency
        })));

        if (Math.abs(imbalance) < 0.001) return;

        const currentBase = JournalCalculator.getLineBaseAmount(line);
        const nominal = typeof line.amount === 'string' ? parseFloat(line.amount) : line.amount;

        if (!nominal || nominal === 0) return;

        const targetBase = line.transactionType === TransactionType.DEBIT
            ? currentBase - imbalance
            : currentBase + imbalance;

        const newRate = JournalCalculator.calculateImpliedRate(nominal, targetBase);
        const roundedRate = Math.round(newRate * 1000000) / 1000000; // 6 decimal precision for rates

        // Sync to all lines with same currency
        const lineCurrency = line.accountCurrency || preferences.defaultCurrencyCode || AppConfig.defaultCurrency;
        setLines(prev => prev.map(l => {
            const lCurrency = l.accountCurrency || preferences.defaultCurrencyCode || AppConfig.defaultCurrency;
            if (lCurrency === lineCurrency && lCurrency !== (preferences.defaultCurrencyCode || AppConfig.defaultCurrency)) {
                return { ...l, exchangeRate: roundedRate.toString() };
            }
            return l.id === id ? { ...l, exchangeRate: roundedRate.toString() } : l;
        }));
    }, [lines]);

    const submit = async (overrides?: { description?: string }) => {
        setIsSubmitting(true);
        try {
            // Default description to transaction type if empty
            let finalDescription = overrides?.description || description.trim();
            if (!finalDescription) {
                finalDescription = transactionType.charAt(0).toUpperCase() + transactionType.slice(1);
                setDescription(finalDescription);
            }

            const result = await journalService.saveJournalEntry({
                lines,
                description: finalDescription,
                journalDate,
                journalTime,
                journalId: isEdit ? journalId : undefined,
                mode: isGuidedMode ? 'simple' : 'advanced'
            });

            if (!result.success) {
                showErrorAlert(result.error || 'Unknown error');
                return result;
            }

            options.onSuccess?.();
            return result;
        } catch {
            showErrorAlert('Unexpected error occurred');
            return { success: false, error: 'Unexpected error occurred' };
        } finally {
            setIsSubmitting(false);
        }
    };

    return {
        isGuidedMode,
        setIsGuidedMode: setGuidedModeInternal,
        transactionType,
        setTransactionType,
        isEdit,
        isLoading,
        lines,
        setLines,
        description,
        setDescription,
        journalDate,
        setJournalDate,
        journalTime,
        setJournalTime,
        isSubmitting,
        addLine,
        removeLine,
        updateLine,
        balanceLine,
        autoFetchLineRate,
        submit
    };
}
