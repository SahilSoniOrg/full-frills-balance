import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { TransactionWithAccountInfo } from '@/src/types/readModels';
import { useEffect, useState } from 'react';

/**
 * Hook to fetch transactions for a specific journal with account information
 */
export function useJournalTransactionsWithAccountInfo(journalId: string | null) {
    const [transactions, setTransactions] = useState<TransactionWithAccountInfo[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!journalId) {
            setTransactions([]);
            setIsLoading(false);
            return;
        }

        const loadTransactions = async () => {
            try {
                setIsLoading(true);
                const data = await transactionRepository.findByJournalWithAccountInfo(journalId);
                setTransactions(data);
            } catch (error) {
                console.error('Failed to load journal transactions:', error);
            } finally {
                setIsLoading(false);
            }
        };

        loadTransactions();
    }, [journalId]);

    return { transactions, isLoading };
}
