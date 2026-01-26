/**
 * Reactive Data Hooks for Journal/Transactions
 */
import { journalRepository } from '@/src/data/repositories/JournalRepository'
import { EnrichedJournal, EnrichedTransaction } from '@/src/types/domain'
import { useEffect, useState } from 'react'

/**
 * Hook to reactively get journals with pagination and account enrichment
 */
export function useJournals(pageSize: number = 50) {
    const [journals, setJournals] = useState<EnrichedJournal[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isLoadingMore, setIsLoadingMore] = useState(false)
    const [hasMore, setHasMore] = useState(true)
    const [currentLimit, setCurrentLimit] = useState(pageSize)

    useEffect(() => {
        const { journalsObservable, transactionsObservable } = journalRepository.observeEnrichedJournals(currentLimit)

        const subscription = journalsObservable.subscribe(async (loaded) => {
            const enriched = await journalRepository.findEnrichedJournals(currentLimit)
            setJournals(enriched)
            setHasMore(loaded.length >= currentLimit)
            setIsLoading(false)
            setIsLoadingMore(false)
        })

        const txSubscription = transactionsObservable.subscribe(async () => {
            // Re-fetch enriched journals when any transaction changes
            const enriched = await journalRepository.findEnrichedJournals(currentLimit)
            setJournals(enriched)
        })

        return () => {
            subscription.unsubscribe()
            txSubscription.unsubscribe()
        }
    }, [currentLimit])

    const loadMore = () => {
        if (isLoadingMore || !hasMore) return
        setIsLoadingMore(true)
        setCurrentLimit(prev => prev + pageSize)
    }

    return { journals, isLoading, isLoadingMore, hasMore, loadMore }
}

/**
 * Custom hook to get reactively updated transactions for an account
 */
export function useAccountTransactions(accountId: string, pageSize: number = 50) {
    const [transactions, setTransactions] = useState<EnrichedTransaction[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isLoadingMore, setIsLoadingMore] = useState(false)
    const [hasMore, setHasMore] = useState(true)
    const [currentLimit, setCurrentLimit] = useState(pageSize)

    useEffect(() => {
        const subscription = journalRepository
            .observeAccountTransactions(accountId, currentLimit)
            .subscribe(async (loaded) => {
                const enriched = await journalRepository.findEnrichedTransactionsForAccount(accountId, currentLimit)
                setTransactions(enriched)
                setHasMore(loaded.length >= currentLimit)
                setIsLoading(false)
                setIsLoadingMore(false)
            })

        return () => subscription.unsubscribe()
    }, [accountId, currentLimit])

    const loadMore = () => {
        if (isLoadingMore || !hasMore) return
        setIsLoadingMore(true)
        setCurrentLimit(prev => prev + pageSize)
    }

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
