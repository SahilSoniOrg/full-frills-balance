import { AppConfig } from '@/src/constants/app-config'
import { accountRepository } from '@/src/data/repositories/AccountRepository'
import { journalRepository } from '@/src/data/repositories/JournalRepository'
import { transactionRepository } from '@/src/data/repositories/TransactionRepository'
import { useObservable } from '@/src/hooks/useObservable'
import { balanceService } from '@/src/services/BalanceService'
import { wealthService } from '@/src/services/wealth-service'
import { AccountBalance } from '@/src/types/domain'
import { logger } from '@/src/utils/logger'
import { preferences } from '@/src/utils/preferences'
import { combineLatest, debounceTime, switchMap } from 'rxjs'

/**
 * Hook to reactively get all account balances and net worth
 * 
 * Optimizations:
 * - Debounced recalculation (300ms) to prevent rapid re-renders
 * - Subscribes to accounts (fewer entities, ~10-50) instead of journals (~10k)
 * - Also subscribes to transactions to catch balance changes
 */
export function useNetWorth() {
    const { data, isLoading } = useObservable(
        () => combineLatest([
            accountRepository.observeAll(),
            transactionRepository.observeActiveWithColumns([
                'amount',
                'transaction_type',
                'transaction_date',
                'deleted_at',
                'account_id',
                'journal_id',
                'currency_code',
                'exchange_rate'
            ]),
            journalRepository.observeStatusMeta()
        ]).pipe(
            debounceTime(300),
            switchMap(async () => {
                try {
                    const targetCurrency = preferences.defaultCurrencyCode || AppConfig.defaultCurrency
                    const balances = await balanceService.getAccountBalances()
                    const wealth = await wealthService.calculateSummary(balances, targetCurrency)

                    return {
                        balances,
                        ...wealth,
                    }
                } catch (error) {
                    logger.error('Failed to calculate net worth:', error)
                    return {
                        balances: [] as AccountBalance[],
                        netWorth: 0,
                        totalAssets: 0,
                        totalLiabilities: 0
                    }
                }
            })
        ),
        [],
        {
            balances: [] as AccountBalance[],
            netWorth: 0,
            totalAssets: 0,
            totalLiabilities: 0
        }
    )

    return {
        ...data,
        isLoading
    }
}
