import { database } from '@/src/data/database/Database';
import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { journalEntryService } from '@/src/services/journal-entry-service';
import { showErrorAlert, showSuccessAlert } from '@/src/utils/alerts';
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
    const isEdit = !!journalId;

    // Advanced / Generic state
    const [lines, setLines] = useState<JournalEntryLine[]>([
        { id: '1', accountId: '', accountName: '', accountType: AccountType.ASSET, amount: '', transactionType: TransactionType.DEBIT, notes: '', exchangeRate: '' },
        { id: '2', accountId: '', accountName: '', accountType: AccountType.ASSET, amount: '', transactionType: TransactionType.CREDIT, notes: '', exchangeRate: '' },
    ]);
    const [description, setDescription] = useState('');
    const [journalDate, setJournalDate] = useState(new Date().toISOString().split('T')[0]);
    const [journalTime, setJournalTime] = useState(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }));
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Load initial data for edit mode
    useEffect(() => {
        if (journalId) {
            const loadData = async () => {
                try {
                    const journal = await database.collections.get('journals').find(journalId) as any;
                    if (journal) {
                        const dateObj = new Date(journal.journalDate);
                        setDescription(journal.description || '');
                        setJournalDate(dateObj.toISOString().split('T')[0]);
                        setJournalTime(dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }));

                        const txs = await transactionRepository.findByJournalWithAccountInfo(journalId);
                        if (txs.length > 0) {
                            // Auto-switch to advanced mode if more than 2 lines
                            if (txs.length > 2) {
                                setIsGuidedMode(false);
                            }

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
        setIsSubmitting(true);
        try {
            const result = await journalEntryService.submitCJournalEntry(lines, description, journalDate, journalTime, isEdit ? journalId : undefined);

            if (!result.success) {
                showErrorAlert(result.error || 'Unknown error');
                return;
            }

            if (result.action === 'updated') {
                showSuccessAlert('Updated', 'Transaction updated successfully');
            } else {
                showSuccessAlert('Created', 'Transaction created successfully');
            }
            router.back();
        } catch {
            showErrorAlert('Unexpected error occurred');
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
        journalTime,
        setJournalTime,
        isSubmitting,
        addLine,
        removeLine,
        updateLine,
        submit
    };
}
