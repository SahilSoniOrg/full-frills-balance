/**
 * Reactive Data Hooks for Journal/Transactions
 */
import { journalRepository } from '@/src/data/repositories/JournalRepository'
import { usePaginatedObservable } from '@/src/hooks/usePaginatedObservable'
import { EnrichedJournal, EnrichedTransaction } from '@/src/types/domain'
import { useEffect, useMemo, useState } from 'react'

/**
 * Hook to reactively get journals with pagination and account enrichment
 */
export function useJournals(pageSize: number = 50, dateRange?: { startDate: number, endDate: number }) {
    const { items: journals, isLoading, isLoadingMore, hasMore, loadMore } = usePaginatedObservable<any, EnrichedJournal>({
        pageSize,
        dateRange,
        observe: (limit, range) => {
            const { journalsObservable } = journalRepository.observeEnrichedJournals(limit, range)
            return journalsObservable
        },
        enrich: (_, limit, range) => journalRepository.findEnrichedJournals(limit, range),
        secondaryObserve: () => {
            const { transactionsObservable } = journalRepository.observeEnrichedJournals(1, undefined)
            return transactionsObservable
        },
    })

    return { journals, isLoading, isLoadingMore, hasMore, loadMore }
}


/**
 * Custom hook to get reactively updated transactions for an account
 * 
 * Note: This hook uses usePaginatedObservable with account-specific filtering.
 * The accountId is included in the dateRange key to trigger proper resets.
 */
export function useAccountTransactions(accountId: string, pageSize: number = 50, dateRange?: { startDate: number, endDate: number }) {
    // Create a composite date range that includes accountId for proper filter change detection
    const compositeRange = useMemo(() => {
        if (!dateRange) return undefined
        return { ...dateRange, accountId } as { startDate: number, endDate: number, accountId?: string }
    }, [dateRange, accountId])

    const { items: transactions, isLoading, isLoadingMore, hasMore, loadMore } = usePaginatedObservable<any, EnrichedTransaction>({
        pageSize,
        dateRange: compositeRange,
        observe: (limit, range) => journalRepository.observeAccountTransactions(
            accountId,
            limit,
            range ? { startDate: range.startDate, endDate: range.endDate } : undefined
        ),
        enrich: (_, limit, range) => journalRepository.findEnrichedTransactionsForAccount(
            accountId,
            limit,
            range ? { startDate: range.startDate, endDate: range.endDate } : undefined
        ),
    })

    return { transactions, isLoading, isLoadingMore, hasMore, loadMore }
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

        const subscription = journalRepository
            .observeJournalTransactions(journalId)
            .subscribe(async () => {
                const enrichedTxs = await journalRepository.findEnrichedTransactionsByJournal(journalId)
                setTransactions(enrichedTxs)
                setIsLoading(false)
            })

        return () => subscription.unsubscribe()
    }, [journalId])

    return { transactions, isLoading }
}
