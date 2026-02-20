import { Animation } from '@/src/constants';
import Account from '@/src/data/models/Account';
import Transaction from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { balanceService } from '@/src/services/BalanceService';
import { reportService } from '@/src/services/report-service';
import { wealthService, WealthSummary } from '@/src/services/wealth-service';
import { AccountBalance } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { combineLatest, debounceTime, Observable, shareReplay, switchMap } from 'rxjs';

/**
 * Consolidated reactive data for dashboard widgets.
 * Eliminates duplicate subscriptions by providing a single source of truth.
 */
export interface DashboardData {
    accounts: Account[];
    transactions: Transaction[];
    balances: AccountBalance[];
    wealthSummary: WealthSummary;
}

/**
 * Monthly income and expense flow data.
 */
export interface MonthlyFlowData {
    income: number;
    expense: number;
}

/**
 * ReactiveDataService - Centralized observable management for dashboard data.
 * 
 * Consolidates multiple repository subscriptions into shared observables
 * to eliminate duplicate subscriptions and reduce re-render overhead.
 * 
 * Uses RxJS shareReplay(1) to multicast emissions to all subscribers.
 */
class ReactiveDataService {

    /**
     * Get or create the shared dashboard data observable.
     * Uses shareReplay(1) to multicast to all subscribers.
     */
    observeDashboardData(targetCurrency: string): Observable<DashboardData> {
        // Note: We create a new observable per currency to avoid stale data
        // This is acceptable since currency changes are rare
        return combineLatest([
            accountRepository.observeAll(),
            transactionRepository.observeActiveWithColumns([
                'amount',
                'transaction_type',
                'transaction_date',
                'currency_code',
                'account_id',
                'exchange_rate',
                'updated_at'
            ]),
            currencyRepository.observeAll(),
            journalRepository.observeStatusMeta(),
        ]).pipe(
            debounceTime(Animation.dataRefreshDebounce),
            switchMap(async ([accounts, transactions]) => {
                try {
                    // Optimized balance fetching with parallel aggregation
                    const balances = await balanceService.getAccountBalances(Date.now(), targetCurrency);

                    // Filter for leaf accounts ONLY for summary to prevent double-counting
                    const parentIds = new Set(accounts.map(a => a.parentAccountId).filter(Boolean) as string[]);
                    const leafBalances = balances.filter(b => !parentIds.has(b.accountId));

                    // Calculate wealth summary from leaf balances
                    const wealthSummary = await wealthService.calculateSummary(leafBalances, targetCurrency);

                    return {
                        accounts,
                        transactions,
                        balances,
                        wealthSummary,
                    };
                } catch (error) {
                    logger.error('Failed to calculate dashboard data:', error);
                    return {
                        accounts,
                        transactions,
                        balances: [],
                        wealthSummary: {
                            netWorth: 0,
                            totalAssets: 0,
                            totalLiabilities: 0,
                            totalEquity: 0,
                            totalIncome: 0,
                            totalExpense: 0,
                        },
                    };
                }
            }),
            shareReplay(1) // Multicast to all subscribers
        );
    }

    /**
     * Observe monthly income and expense flow.
     * Derives data from the shared dashboard observable.
     */
    observeMonthlyFlow(targetCurrency: string): Observable<MonthlyFlowData> {
        return combineLatest([
            accountRepository.observeAll(),
            transactionRepository.observeActiveWithColumns([
                'amount',
                'transaction_type',
                'transaction_date',
                'currency_code',
                'exchange_rate'
            ])
        ]).pipe(
            debounceTime(Animation.dataRefreshDebounce),
            switchMap(async ([accounts, transactions]) => {
                try {
                    const now = new Date();
                    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
                    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();

                    return await reportService.getIncomeVsExpenseFromTransactions(
                        transactions,
                        accounts,
                        startOfMonth,
                        endOfMonth,
                        targetCurrency
                    );
                } catch (error) {
                    logger.error('Failed to calculate monthly flow:', error);
                    return { income: 0, expense: 0 };
                }
            }),
            shareReplay(1)
        );
    }
}

export const reactiveDataService = new ReactiveDataService();
