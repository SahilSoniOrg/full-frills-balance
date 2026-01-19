/**
 * Reactive Data Hooks
 * 
 * Custom hooks that use WatermelonDB observables for real-time data updates.
 */

import Account from '@/src/data/models/Account'
import Journal from '@/src/data/models/Journal'
import Transaction from '@/src/data/models/Transaction'
import { AccountBalance, accountRepository } from '@/src/data/repositories/AccountRepository'
import { Q } from '@nozbe/watermelondb'
import { useDatabase } from '@nozbe/watermelondb/react'
import { useEffect, useRef, useState } from 'react'

/**
 * Hook to reactively get all accounts
 */
export function useAccounts() {
    const database = useDatabase()
    const [accounts, setAccounts] = useState<Account[]>([])
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        const collection = database.collections.get<Account>('accounts')
        const subscription = collection
            .query(Q.where('deleted_at', Q.eq(null)))
            .observe()
            .subscribe((accounts) => {
                setAccounts(accounts)
                setIsLoading(false)
            })

        return () => subscription.unsubscribe()
    }, [database])

    return { accounts, isLoading }
}

/**
 * Hook to reactively get accounts by type
 */
export function useAccountsByType(accountType: string) {
    const database = useDatabase()
    const [accounts, setAccounts] = useState<Account[]>([])
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        const collection = database.collections.get<Account>('accounts')
        const subscription = collection
            .query(
                Q.where('account_type', accountType),
                Q.where('deleted_at', Q.eq(null))
            )
            .observe()
            .subscribe((accounts) => {
                setAccounts(accounts)
                setIsLoading(false)
            })

        return () => subscription.unsubscribe()
    }, [database, accountType])

    return { accounts, isLoading }
}

/**
 * Hook to reactively get all journals
 */
export function useJournals() {
    const database = useDatabase()
    const [journals, setJournals] = useState<Journal[]>([])
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        const collection = database.collections.get<Journal>('journals')
        const subscription = collection
            .query(
                Q.where('deleted_at', Q.eq(null)),
                Q.sortBy('journal_date', Q.desc)
            )
            .observe()
            .subscribe((journals) => {
                setJournals(journals)
                setIsLoading(false)
            })

        return () => subscription.unsubscribe()
    }, [database])

    return { journals, isLoading }
}

/**
 * Hook to reactively get transactions for an account
 */
export function useAccountTransactions(accountId: string | null) {
    const database = useDatabase()
    const [transactions, setTransactions] = useState<Transaction[]>([])
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        if (!accountId) {
            setTransactions([])
            setIsLoading(false)
            return
        }

        const collection = database.collections.get<Transaction>('transactions')
        const subscription = collection
            .query(
                Q.where('account_id', accountId),
                Q.where('deleted_at', Q.eq(null)),
                Q.sortBy('transaction_date', Q.desc)
            )
            .observe()
            .subscribe((transactions) => {
                setTransactions(transactions)
                setIsLoading(false)
            })

        return () => subscription.unsubscribe()
    }, [database, accountId])

    return { transactions, isLoading }
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

/**
 * Hook to reactively get a single account by ID
 */
export function useAccount(accountId: string | null) {
    const database = useDatabase()
    const [account, setAccount] = useState<Account | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        if (!accountId) {
            setAccount(null)
            setIsLoading(false)
            return
        }

        const collection = database.collections.get<Account>('accounts')
        const subscription = collection
            .findAndObserve(accountId)
            .subscribe({
                next: (account) => {
                    setAccount(account)
                    setIsLoading(false)
                },
                error: () => {
                    setAccount(null)
                    setIsLoading(false)
                },
            })

        return () => subscription.unsubscribe()
    }, [database, accountId])

    return { account, isLoading }
}

/**
 * Hook to reactively get account balance
 */
export function useAccountBalance(accountId: string | null) {
    const database = useDatabase()
    const [balanceData, setBalanceData] = useState<AccountBalance | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        if (!accountId) {
            setBalanceData(null)
            setIsLoading(false)
            return
        }

        // Re-calculate balance whenever transactions for this account change
        const collection = database.collections.get<Transaction>('transactions')
        const subscription = collection
            .query(Q.where('account_id', accountId))
            .observe()
            .subscribe(async () => {
                try {
                    const data = await accountRepository.getAccountBalance(accountId)
                    setBalanceData(data)
                } catch (error) {
                    console.error('Failed to update account balance:', error)
                } finally {
                    setIsLoading(false)
                }
            })

        return () => subscription.unsubscribe()
    }, [database, accountId])

    return { balanceData, isLoading }
}

/**
 * Hook to reactively get all account balances and net worth
 * 
 * Optimizations:
 * - Debounced recalculation (300ms) to prevent rapid re-renders
 * - Subscribes to journals (fewer entities) instead of all transactions
 */
export function useNetWorth() {
    const database = useDatabase()
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [data, setData] = useState<{
        balances: AccountBalance[]
        netWorth: number
        totalAssets: number
        totalLiabilities: number
        isLoading: boolean
    }>({
        balances: [],
        netWorth: 0,
        totalAssets: 0,
        totalLiabilities: 0,
        isLoading: true
    })

    useEffect(() => {
        // Calculate net worth with debouncing
        const calculateNetWorth = async () => {
            try {
                const balances = await accountRepository.getAccountBalances()

                let totalAssets = 0
                let totalLiabilities = 0

                balances.forEach(b => {
                    if (b.accountType === 'ASSET') {
                        totalAssets += b.balance
                    } else if (b.accountType === 'LIABILITY') {
                        totalLiabilities += b.balance
                    }
                })

                const netWorth = totalAssets - totalLiabilities

                setData({
                    balances,
                    netWorth,
                    totalAssets,
                    totalLiabilities,
                    isLoading: false
                })
            } catch (error) {
                console.error('Failed to calculate net worth:', error)
                setData(prev => ({ ...prev, isLoading: false }))
            }
        }

        // Debounced calculation
        const debouncedCalculate = () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current)
            }
            timeoutRef.current = setTimeout(calculateNetWorth, 300)
        }

        // Subscribe to journal changes (fewer updates than transactions)
        const collection = database.collections.get<Journal>('journals')
        const subscription = collection
            .query(Q.where('deleted_at', Q.eq(null)))
            .observe()
            .subscribe(debouncedCalculate)

        // Initial load (immediate, no debounce)
        calculateNetWorth()

        return () => {
            subscription.unsubscribe()
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current)
            }
        }
    }, [database])

    return data
}

