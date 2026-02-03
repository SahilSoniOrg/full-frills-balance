import { journalRepository } from '@/src/data/repositories/JournalRepository'
import { transactionRepository } from '@/src/data/repositories/TransactionRepository'
import { usePaginatedObservable } from '@/src/hooks/usePaginatedObservable'
import { EnrichedJournal, EnrichedTransaction } from '@/src/types/domain'
import { useEffect, useState } from 'react'

/**
 * Hook to reactively get journals with pagination and account enrichment
 */
export function useJournals(pageSize: number = 50, dateRange?: { startDate: number, endDate: number }) {
    const { items: journals, isLoading, isLoadingMore, hasMore, loadMore } = usePaginatedObservable<any, EnrichedJournal>({
        pageSize,
        dateRange,
        observe: (limit, range) => journalRepository.observeEnrichedJournals(limit, range)
    })

    return { journals, isLoading, isLoadingMore, hasMore, loadMore }
}


/**
 * Custom hook to get reactively updated transactions for an account
 * 
 * Note: This hook uses repository-owned enriched observables to react to account changes.
 */
export function useAccountTransactions(accountId: string, pageSize: number = 50, dateRange?: { startDate: number, endDate: number }) {
    const { items: transactions, isLoading, isLoadingMore, hasMore, loadMore, version } = usePaginatedObservable<any, EnrichedTransaction>({
        pageSize,
        dateRange,
        observe: (limit, range) => transactionRepository.observeEnrichedForAccount(
            accountId,
            limit,
            range
        )
    })

    return { transactions, isLoading, isLoadingMore, hasMore, loadMore, version }
}


/**
 * Hook to reactively get transactions for a specific journal with account names
 */
export function useJournalTransactions(journalId: string | null) {
    const [transactions, setTransactions] = useState<EnrichedTransaction[]>([])
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        if (!journalId) {
            setTransactions([])
            setIsLoading(false)
            return
        }

        const subscription = transactionRepository
            .observeEnrichedByJournal(journalId)
            .subscribe((enrichedTxs) => {
                setTransactions(enrichedTxs)
                setIsLoading(false)
            })

        return () => subscription.unsubscribe()
    }, [journalId])

    return { transactions, isLoading }
}
