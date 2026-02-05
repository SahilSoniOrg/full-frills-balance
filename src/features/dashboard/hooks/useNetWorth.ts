import { AppConfig } from '@/src/constants/app-config'
import { accountRepository } from '@/src/data/repositories/AccountRepository'
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository'
import { journalRepository } from '@/src/data/repositories/JournalRepository'
import { transactionRepository } from '@/src/data/repositories/TransactionRepository'
import { useUI } from '@/src/contexts/UIContext'
import { useObservable } from '@/src/hooks/useObservable'
import { balanceService } from '@/src/services/BalanceService'
import { wealthService } from '@/src/services/wealth-service'
import { AccountBalance } from '@/src/types/domain'
import { logger } from '@/src/utils/logger'
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
    const { defaultCurrency } = useUI()
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
            journalRepository.observeStatusMeta(),
            currencyRepository.observeAll()
        ]).pipe(
            debounceTime(300),
            switchMap(async ([accounts, transactions, _status, currencies]) => {
                try {
                    const targetCurrency = defaultCurrency || AppConfig.defaultCurrency
                    const precisionMap = new Map(currencies.map((currency) => [currency.code, currency.precision]))
                    const balancesMap = balanceService.calculateBalancesFromTransactions(accounts, transactions, precisionMap)
                    const balances = Array.from(balancesMap.values())
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
        [defaultCurrency],
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
