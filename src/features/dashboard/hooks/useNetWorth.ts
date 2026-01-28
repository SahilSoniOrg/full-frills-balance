import Account from '@/src/data/models/Account'
import Transaction from '@/src/data/models/Transaction'
import { accountRepository } from '@/src/data/repositories/AccountRepository'
import { wealthService } from '@/src/services/wealth-service'
import { AccountBalance } from '@/src/types/domain'
import { logger } from '@/src/utils/logger'
import { Q } from '@nozbe/watermelondb'
import { useDatabase } from '@nozbe/watermelondb/react'
import { useEffect, useRef, useState } from 'react'

/**
 * Hook to reactively get all account balances and net worth
 * 
 * Optimizations:
 * - Debounced recalculation (300ms) to prevent rapid re-renders
 * - Subscribes to accounts (fewer entities, ~10-50) instead of journals (~10k)
 * - Also subscribes to transactions to catch balance changes
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
                const wealth = wealthService.calculateSummary(balances)

                setData({
                    balances,
                    ...wealth,
                    isLoading: false
                })
            } catch (error) {
                logger.error('Failed to calculate net worth:', error)
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

        // Subscribe to account changes (account creation/deletion)
        const accountsCollection = database.collections.get<Account>('accounts')
        const accountSubscription = accountsCollection
            .query(Q.where('deleted_at', Q.eq(null)))
            .observe()
            .subscribe(debouncedCalculate)

        // Subscribe to transaction changes (balance updates)
        // This is more targeted than journals - only fires when transactions change
        const transactionsCollection = database.collections.get<Transaction>('transactions')
        const transactionSubscription = transactionsCollection
            .query(Q.where('deleted_at', Q.eq(null)))
            .observe()
            .subscribe(debouncedCalculate)

        // Initial load (immediate, no debounce)
        calculateNetWorth()

        return () => {
            accountSubscription.unsubscribe()
            transactionSubscription.unsubscribe()
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current)
            }
        }
    }, [database])

    return data
}
