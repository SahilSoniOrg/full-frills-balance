import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { useObservable } from '@/src/hooks/useObservable';

/**
 * Hook to fetch transactions for a specific journal with account information
 * This version is reactive and will update when transactions are modified.
 */
export function useJournalTransactionsWithAccountInfo(journalId: string | null) {
    const { data: transactions, isLoading } = useObservable(
        () => {
            return transactionRepository.observeByJournalWithAccountInfo(journalId || '');
        },
        [journalId],
        [] as any[]
    );

    return {
        transactions,
        isLoading: !journalId ? false : isLoading
    };
}
