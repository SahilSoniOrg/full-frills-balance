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

export type DashboardSummaryData = Omit<DashboardData, 'transactions'>;

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
     * Specialized lightweight observable for the Accounts List.
     * Excludes raw transactions to minimize JS thread serialization overhead.
     */
    observeAccountsSummary(targetCurrency: string): Observable<DashboardSummaryData> {
        return this.observeDashboardData(targetCurrency).pipe(
            // We map out the transactions to avoid cloning/serialization overhead for this subscriber
            switchMap(async (data) => {
                const { transactions, ...summary } = data;
                return summary;
            }),
            shareReplay(1)
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
    /**
     * Optimized lightweight observable for the Accounts List.
     * Uses raw SQL for heavy lifting and minimizes JS thread overhead.
     */
    observeOptimizedAccountList(targetCurrency: string): Observable<DashboardSummaryData> {
        return combineLatest([
            accountRepository.observeAll(), // Still observe for structural changes
            journalRepository.observeStatusMeta(), // Observe for status changes (posted/reversed)
        ]).pipe(
            debounceTime(Animation.dataRefreshDebounce),
            switchMap(async ([accounts]) => {
                try {
                    const now = new Date();
                    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
                    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();

                    // 1. Fetch raw balances and stats in a single pass using the optimized SQL query
                    const rawItemsResponse = await accountRepository.getAccountListItemsRaw(startOfMonth, endOfMonth);

                    let finalBalances: AccountBalance[] = [];

                    if (rawItemsResponse === null) {
                        // --- FALLBACK PATH (Web/LokiJS) ---
                        // If raw SQL is not supported, use the slower but functional ORM-based fetch
                        finalBalances = await balanceService.getAccountBalances(now.getTime(), targetCurrency);
                    } else {
                        // --- OPTIMIZED PATH (Native SQLite) ---
                        // Normalize result format: some adapters return array, others return { rows: [] }
                        const rawItems: any[] = Array.isArray(rawItemsResponse)
                            ? rawItemsResponse
                            : ((rawItemsResponse as any)?.rows || []);

                        // Map raw items back to AccountBalance readable format
                        const balances: AccountBalance[] = rawItems.map((item: any) => this.mapRawToBalance(item, now.getTime()));


                        const validBalances = balances.filter(b => b.accountId && b.accountId !== 'undefined');
                        const balancesMap = new Map(validBalances.map(b => [b.accountId, b]));

                        // Perform hierarchical aggregation for the optimized path
                        const currencyPrecisionMap = await currencyRepository.getAllPrecisions();
                        const precisionMap = new Map<string, number>();
                        for (const account of accounts) {
                            const precision = currencyPrecisionMap.get(account.currencyCode) ?? 2;
                            precisionMap.set(account.id, precision);
                        }

                        await balanceService.aggregateBalances(accounts, balancesMap, precisionMap, targetCurrency);
                        finalBalances = Array.from(balancesMap.values());
                    }

                    // 4. Calculate wealth summary
                    const parentIds = new Set(accounts.map(a => a.parentAccountId).filter(Boolean) as string[]);
                    const leafBalances = finalBalances.filter(b => !parentIds.has(b.accountId));
                    const wealthSummary = await wealthService.calculateSummary(leafBalances, targetCurrency);

                    return {
                        accounts,
                        balances: finalBalances,
                        wealthSummary,
                    };
                } catch (error) {
                    logger.error('Failed to calculate optimized account list:', error);
                    return {
                        accounts,
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
            shareReplay(1)
        );
    }
    /**
     * Optimized observable for a specific account's dashboard/detail view.
     * Consolidates account info, balance, and sub-account tree.
     */
    observeAccountDashboard(accountId: string, targetCurrency: string): Observable<{
        account: Account | null;
        balance: AccountBalance | null;
        subAccounts: AccountBalance[];
        allAccounts: Account[];
    }> {
        return combineLatest([
            accountRepository.observeAll(), // structural + all accounts for tree
            journalRepository.observeStatusMeta(),
        ]).pipe(
            debounceTime(Animation.dataRefreshDebounce),
            switchMap(async ([accounts]) => {
                const targetAccount = accounts.find(a => a.id === accountId);
                if (!targetAccount) {
                    // If not found in active, try to find in deleted (one-shot find for efficiency)
                    const deletedAccount = await accountRepository.find(accountId);
                    if (!deletedAccount) return { account: null, balance: null, subAccounts: [], allAccounts: accounts };

                    // If deleted, we still want to show its details. 
                    // Note: This won't be as reactive as active accounts, but deletion is a rare event.
                    // We'll proceed with this account.
                    return { account: deletedAccount, balance: null, subAccounts: [], allAccounts: accounts };
                }

                try {
                    const now = new Date();
                    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
                    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();

                    // Fetch ALL balances raw (most efficient way to get tree balances too)
                    const rawItemsResponse = await accountRepository.getAccountListItemsRaw(startOfMonth, endOfMonth, true);

                    let finalBalances: AccountBalance[] = [];

                    if (rawItemsResponse === null) {
                        finalBalances = await balanceService.getAccountBalances(now.getTime(), targetCurrency);
                    } else {
                        const rawItems: any[] = Array.isArray(rawItemsResponse) ? rawItemsResponse : ((rawItemsResponse as any)?.rows || []);
                        const balances: AccountBalance[] = rawItems.map((item: any) => this.mapRawToBalance(item, now.getTime()));
                        const validBalances = balances.filter(b => b.accountId && b.accountId !== 'undefined');
                        const balancesMap = new Map(validBalances.map(b => [b.accountId, b]));

                        const currencyPrecisionMap = await currencyRepository.getAllPrecisions();
                        const precisionMap = new Map<string, number>();
                        for (const account of accounts) {
                            const precision = currencyPrecisionMap.get(account.currencyCode) ?? 2;
                            precisionMap.set(account.id, precision);
                        }

                        await balanceService.aggregateBalances(accounts, balancesMap, precisionMap, targetCurrency);
                        finalBalances = Array.from(balancesMap.values());
                    }

                    const balancesMap = new Map(finalBalances.map(b => [b.accountId, b]));
                    const balance = balancesMap.get(accountId) || null;

                    // Get sub-accounts (all descendants)
                    const getDescendants = (parentId: string): Account[] => {
                        const directChildren = accounts.filter(a => a.parentAccountId === parentId);
                        const all: Account[] = [...directChildren];
                        for (const child of directChildren) {
                            all.push(...getDescendants(child.id));
                        }
                        return all;
                    };

                    const descendants = getDescendants(accountId);
                    const subBalances = descendants
                        .map(d => balancesMap.get(d.id))
                        .filter((b): b is AccountBalance => !!b);

                    return {
                        account: targetAccount,
                        balance,
                        subAccounts: subBalances,
                        allAccounts: accounts,
                    };
                } catch (error) {
                    logger.error('Failed to calculate account dashboard:', error);
                    return { account: targetAccount, balance: null, subAccounts: [], allAccounts: accounts };
                }
            }),
            shareReplay(1)
        );
    }

    private mapRawToBalance(item: any, now: number): AccountBalance {
        const getProp = (obj: any, ...keys: string[]) => {
            for (const key of keys) {
                if (obj[key] !== undefined) return obj[key];
                if (obj[key.toLowerCase()] !== undefined) return obj[key.toLowerCase()];
                if (obj[key.toUpperCase()] !== undefined) return obj[key.toUpperCase()];
                const snake = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
                if (obj[snake] !== undefined) return obj[snake];
            }
            return undefined;
        };

        const accountId = getProp(item, 'id', 'accountId', 'account_id');
        const balance = Number(getProp(item, 'direct_balance', 'directBalance') || 0);
        const currencyCode = getProp(item, 'currency_code', 'currencyCode') || 'USD';
        const accountType = getProp(item, 'account_type', 'accountType');
        const income = Number(getProp(item, 'monthly_income', 'monthlyIncome') || 0);
        const expenses = Number(getProp(item, 'monthly_expenses', 'monthlyExpenses') || 0);
        const txCount = Number(getProp(item, 'direct_transaction_count', 'directTransactionCount') || 0);

        return {
            accountId: String(accountId),
            balance: balance,
            directBalance: balance,
            currencyCode: String(currencyCode),
            transactionCount: txCount,
            directTransactionCount: txCount,
            asOfDate: now,
            accountType: accountType as any,
            monthlyIncome: income,
            monthlyExpenses: expenses,
        };
    }
}

export const reactiveDataService = new ReactiveDataService();

