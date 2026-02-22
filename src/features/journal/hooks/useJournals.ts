import { journalService } from '@/src/features/journal/services/JournalService'
import { transactionService } from '@/src/features/journal/services/TransactionService'
import { useObservable } from '@/src/hooks/useObservable'
import { usePaginatedObservable } from '@/src/hooks/usePaginatedObservable'
import { useLedgerTransactionsForAccount } from '@/src/services/ledger'
import { EnrichedJournal, TransactionWithAccountInfo } from '@/src/types/domain'
import { useCallback } from 'react'
import { of } from 'rxjs'

/**
 * Hook to reactively get journals with pagination and account enrichment
 */
export function useJournals(pageSize: number = 50, dateRange?: { startDate: number, endDate: number }, searchQuery?: string) {
    const observe = useCallback((limit: number, range?: { startDate: number, endDate: number }, query?: string) => {
        return journalService.observeEnrichedJournals(limit, range, query)
    }, [])

    const { items: journals, isLoading, isLoadingMore, hasMore, loadMore } = usePaginatedObservable<any, EnrichedJournal>({
        pageSize,
        dateRange,
        searchQuery,
        observe
    })

    return { journals, isLoading, isLoadingMore, hasMore, loadMore }
}


/**
 * Custom hook to get reactively updated transactions for an account
 * 
 * Note: This hook uses repository-owned enriched observables to react to account changes.
 */
export function useAccountTransactions(accountId: string, pageSize: number = 50, dateRange?: { startDate: number, endDate: number }) {
    return useLedgerTransactionsForAccount(accountId, pageSize, dateRange)
}


/**
 * Hook to reactively get transactions for a specific journal with account names
 */
export function useJournalTransactions(journalId: string | null) {
    const { data: transactions, isLoading } = useObservable(
        () => journalId
            ? transactionService.observeTransactionsWithAccountInfo(journalId)
            : of([] as TransactionWithAccountInfo[]),
        [journalId],
        [] as TransactionWithAccountInfo[]
    );

    return { transactions, isLoading }
}
