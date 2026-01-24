import { AppConfig } from '@/constants';
import { database } from '@/src/data/database/Database';
import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { CreateJournalData, journalRepository } from '@/src/data/repositories/JournalRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { accountingService } from '@/src/domain/AccountingService';
import { JournalLineInput } from '@/src/domain/accounting/JournalCalculator';
import { showErrorAlert, showSuccessAlert } from '@/src/utils/alerts';
import { preferences } from '@/src/utils/preferences';
import { sanitizeAmount } from '@/src/utils/validation';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

export interface JournalEntryLine {
    id: string;
    accountId: string;
    accountName: string;
    accountType: AccountType;
    amount: string;
    transactionType: TransactionType;
    notes: string;
    exchangeRate: string;
    accountCurrency?: string;
}

export interface UseJournalEditorOptions {
    journalId?: string;
    initialMode?: 'simple' | 'advanced';
    initialType?: 'expense' | 'income' | 'transfer';
}

/**
 * useJournalEditor - Controller hook for the Journal Entry screen.
 * Consolidates state management and business logic for both simple and advanced modes.
 */
export function useJournalEditor(options: UseJournalEditorOptions = {}) {
    const router = useRouter();
    const { journalId, initialMode = 'simple', initialType = 'expense' } = options;

    const [isGuidedMode, setIsGuidedMode] = useState(initialMode === 'simple');
    const [transactionType, setTransactionType] = useState<'expense' | 'income' | 'transfer'>(initialType);
    const [isEdit, setIsEdit] = useState(!!journalId);

    // Advanced / Generic state
    const [lines, setLines] = useState<JournalEntryLine[]>([
        { id: '1', accountId: '', accountName: '', accountType: AccountType.ASSET, amount: '', transactionType: TransactionType.DEBIT, notes: '', exchangeRate: '' },
        { id: '2', accountId: '', accountName: '', accountType: AccountType.ASSET, amount: '', transactionType: TransactionType.CREDIT, notes: '', exchangeRate: '' },
    ]);
    const [description, setDescription] = useState('');
    const [journalDate, setJournalDate] = useState(new Date().toISOString().split('T')[0]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Load initial data for edit mode
    useEffect(() => {
        if (journalId) {
            const loadData = async () => {
                try {
                    const journal = await database.collections.get('journals').find(journalId) as any;
                    if (journal) {
                        setDescription(journal.description || '');
                        setJournalDate(new Date(journal.journalDate).toISOString().split('T')[0]);

                        const txs = await transactionRepository.findByJournalWithAccountInfo(journalId);
                        if (txs.length > 0) {
                            setLines(txs.map(tx => ({
                                id: tx.id,
                                accountId: tx.accountId,
                                accountName: tx.accountName,
                                accountType: tx.accountType as AccountType,
                                amount: tx.amount.toString(),
                                transactionType: tx.transactionType as TransactionType,
                                notes: tx.notes || '',
                                exchangeRate: tx.exchangeRate ? tx.exchangeRate.toString() : '',
                                accountCurrency: tx.currencyCode
                            })));
                        }
                    }
                } catch (error) {
                    console.error('Failed to load journal for edit:', error);
                    showErrorAlert('Failed to load transaction');
                }
            };
            loadData();
        }
    }, [journalId]);

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

    const submit = async () => {
        const domainLines: JournalLineInput[] = lines.map(line => ({
            amount: sanitizeAmount(line.amount) || 0,
            type: line.transactionType,
            exchangeRate: line.exchangeRate ? parseFloat(line.exchangeRate) : 1
        }));

        const validation = accountingService.validateBalance(domainLines);
        if (!validation.isValid) {
            showErrorAlert(`Journal is not balanced. Discrepancy: ${validation.imbalance}`);
            return;
        }

        if (!description.trim()) {
            showErrorAlert('Description is required');
            return;
        }

        if (lines.some(l => !l.accountId)) {
            showErrorAlert('All lines must have an account');
            return;
        }

        setIsSubmitting(true);
        try {
            const journalData: CreateJournalData = {
                journalDate: new Date(journalDate).getTime(),
                description: description.trim(),
                currencyCode: preferences.defaultCurrencyCode || AppConfig.defaultCurrency,
                transactions: lines.map(l => ({
                    accountId: l.accountId,
                    amount: sanitizeAmount(l.amount) || 0,
                    transactionType: l.transactionType,
                    notes: l.notes.trim() || undefined,
                    exchangeRate: l.exchangeRate ? parseFloat(l.exchangeRate) : undefined
                }))
            };

            if (isEdit && journalId) {
                await journalRepository.updateJournalWithTransactions(journalId, journalData);
                showSuccessAlert('Updated', 'Transaction updated successfully');
            } else {
                await journalRepository.createJournalWithTransactions(journalData);
                showSuccessAlert('Created', 'Transaction created successfully');
            }
            router.back();
        } catch (error) {
            console.error('Failed to submit journal:', error);
            showErrorAlert('Failed to save transaction');
        } finally {
            setIsSubmitting(false);
        }
    };

    return {
        isGuidedMode,
        setIsGuidedMode,
        transactionType,
        setTransactionType,
        isEdit,
        lines,
        setLines,
        description,
        setDescription,
        journalDate,
        setJournalDate,
        isSubmitting,
        addLine,
        removeLine,
        updateLine,
        submit
    };
}
