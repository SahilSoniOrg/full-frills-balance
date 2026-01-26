/**
 * Reactive Data Hooks for Journal/Transactions
 */
import Journal from '@/src/data/models/Journal'
import Transaction from '@/src/data/models/Transaction'
import { journalRepository } from '@/src/data/repositories/JournalRepository'
import { EnrichedJournal, EnrichedTransaction } from '@/src/types/domain'
import { Q } from '@nozbe/watermelondb'
import { useDatabase } from '@nozbe/watermelondb/react'
import { useEffect, useState } from 'react'

/**
 * Hook to reactively get journals with pagination and account enrichment
 */
export function useJournals(pageSize: number = 50) {
    const database = useDatabase()
    const [journals, setJournals] = useState<EnrichedJournal[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isLoadingMore, setIsLoadingMore] = useState(false)
    const [hasMore, setHasMore] = useState(true)
    const [currentLimit, setCurrentLimit] = useState(pageSize)

    useEffect(() => {
        const journalsCollection = database.collections.get<Journal>('journals')
        const transactionsCollection = database.collections.get<Transaction>('transactions')

        // Observe both journals and transactions
        // Note: Transactions observation ensures badges update immediately on creation
        const journalsObservable = journalsCollection
            .query(
                Q.where('deleted_at', Q.eq(null)),
                Q.sortBy('journal_date', 'desc'),
                Q.take(currentLimit)
            )
            .observe()

        const transactionsObservable = transactionsCollection
            .query(Q.where('deleted_at', Q.eq(null)))
            .observe()

        // Combine observables or simply subscribe to both to trigger enrichment
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
    }, [database, currentLimit])

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
    const database = useDatabase()
    const [transactions, setTransactions] = useState<EnrichedTransaction[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isLoadingMore, setIsLoadingMore] = useState(false)
    const [hasMore, setHasMore] = useState(true)
    const [currentLimit, setCurrentLimit] = useState(pageSize)

    useEffect(() => {
        const collection = database.collections.get<Transaction>('transactions')
        const subscription = collection
            .query(
                Q.where('account_id', accountId),
                Q.where('deleted_at', Q.eq(null)),
                Q.sortBy('transaction_date', Q.desc),
                Q.take(currentLimit)
            )
            .observe()
            .subscribe(async (loaded) => {
                const enriched = await journalRepository.findEnrichedTransactionsForAccount(accountId, currentLimit)
                setTransactions(enriched)
                setHasMore(loaded.length >= currentLimit)
                setIsLoading(false)
                setIsLoadingMore(false)
            })

        return () => subscription.unsubscribe()
    }, [database, accountId, currentLimit])

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
    const database = useDatabase()
    const [transactions, setTransactions] = useState<(Transaction & { accountName?: string })[]>([])
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        if (!journalId) {
            setTransactions([])
            setIsLoading(false)
            return
        }

        const collection = database.collections.get<Transaction>('transactions')
        const subscription = collection
            .query(
                Q.where('journal_id', journalId),
                Q.where('deleted_at', Q.eq(null))
            )
            .observe()
            .subscribe(async (txs) => {
                // Fetch account names for each transaction
                const enrichedTxs = await Promise.all(txs.map(async (tx) => {
                    const account = await tx.account.fetch()
                    const txWithInfo = tx as any
                    txWithInfo.accountName = account?.name || 'Unknown'
                    return txWithInfo
                }))
                setTransactions(enrichedTxs)
                setIsLoading(false)
            })

        return () => subscription.unsubscribe()
    }, [database, journalId])

    return { transactions, isLoading }
}
