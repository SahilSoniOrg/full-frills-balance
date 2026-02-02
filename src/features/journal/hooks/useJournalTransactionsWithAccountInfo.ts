import { useObservable } from '@/src/hooks/useObservable';
import { transactionService } from '@/src/services/TransactionService';

/**
 * Hook to fetch transactions for a specific journal with account information
 * This version is reactive and will update when transactions are modified.
 */
export function useJournalTransactionsWithAccountInfo(journalId: string | null) {
    const { data: transactions, isLoading } = useObservable(
        () => {
            return transactionService.observeTransactionsWithAccountInfo(journalId || '');
        },
        [journalId],
        [] as any[]
    );

    return {
        transactions,
        isLoading: !journalId ? false : isLoading
    };
}
