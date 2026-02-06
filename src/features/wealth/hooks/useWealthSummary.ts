import { UIConstants } from '@/src/constants'
import { AppConfig } from '@/src/constants/app-config'
import { useUI } from '@/src/contexts/UIContext'
import Account from '@/src/data/models/Account'
import { accountRepository } from '@/src/data/repositories/AccountRepository'
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository'
import { journalRepository } from '@/src/data/repositories/JournalRepository'
import { transactionRepository } from '@/src/data/repositories/TransactionRepository'
import { useObservable } from '@/src/hooks/useObservable'
import { balanceService } from '@/src/services/BalanceService'
import { wealthService, WealthSummary } from '@/src/services/wealth-service'
import { AccountBalance } from '@/src/types/domain'
import { logger } from '@/src/utils/logger'
import { combineLatest, debounceTime, switchMap } from 'rxjs'

export interface WealthSummaryResult extends WealthSummary {
    accounts: Account[];
    balances: AccountBalance[];
    balancesMap: Map<string, AccountBalance>;
    isLoading: boolean;
    version: number;
}

/**
 * useWealthSummary - Consolidated hook for net worth and account balances.
 * 
 * Replaces useNetWorth hooks previously scattered across the codebase.
 * Provides a single source of truth for wealth calculations.
 */
export function useWealthSummary(): WealthSummaryResult {
    const { defaultCurrency } = useUI()

    const { data, isLoading, version } = useObservable(
        () => combineLatest([
            accountRepository.observeAll(),
            transactionRepository.observeActiveWithColumns([
                'amount',
                'transaction_type',
                'transaction_date',
                'account_id',
                'currency_code',
                'exchange_rate'
            ]),
            currencyRepository.observeAll(),
            journalRepository.observeStatusMeta(),
        ]).pipe(
            debounceTime(UIConstants.animation.dataRefreshDebounce),
            switchMap(async ([accounts, transactions, currencies, _status]) => {
                try {
                    const targetCurrency = defaultCurrency || AppConfig.defaultCurrency
                    const precisionMap = new Map(currencies.map((currency) => [currency.code, currency.precision]))

                    const balancesMap = balanceService.calculateBalancesFromTransactions(accounts, transactions, precisionMap)
                    const balances = Array.from(balancesMap.values())
                    const wealth = await wealthService.calculateSummary(balances, targetCurrency)

                    return {
                        accounts,
                        balances,
                        balancesMap,
                        ...wealth,
                    }
                } catch (error) {
                    logger.error('Failed to calculate wealth summary:', error)
                    return {
                        accounts: [] as Account[],
                        balances: [] as AccountBalance[],
                        balancesMap: new Map<string, AccountBalance>(),
                        netWorth: 0,
                        totalAssets: 0,
                        totalLiabilities: 0,
                        totalEquity: 0,
                        totalIncome: 0,
                        totalExpense: 0,
                    }
                }
            })
        ),
        [defaultCurrency],
        {
            accounts: [] as Account[],
            balances: [] as AccountBalance[],
            balancesMap: new Map<string, AccountBalance>(),
            netWorth: 0,
            totalAssets: 0,
            totalLiabilities: 0,
            totalEquity: 0,
            totalIncome: 0,
            totalExpense: 0,
        }
    )

    return {
        ...data,
        isLoading,
        version
    }
}
