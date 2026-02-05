import { AppConfig } from '@/src/constants/app-config';
import { useUI } from '@/src/contexts/UIContext';
import Account from '@/src/data/models/Account';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { useObservable } from '@/src/hooks/useObservable';
import { balanceService } from '@/src/services/BalanceService';
import { reportService } from '@/src/services/report-service';
import { WealthSummary, wealthService } from '@/src/services/wealth-service';
import { AccountBalance } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { combineLatest, debounceTime, switchMap } from 'rxjs';

export interface SummaryData extends WealthSummary {
    income: number;
    expense: number;
    accounts: Account[];
    balancesByAccountId: Map<string, AccountBalance>;
}

export interface DashboardSummaryData extends SummaryData {
    isPrivacyMode: boolean;
    isLoading: boolean;
    version: number;
    togglePrivacyMode: () => void;
}

/**
 * Hook for dashboard summary data with net worth, income, and expense
 *
 * Optimizations:
 * - Debounced recalculation (300ms) to prevent rapid re-renders
 * - Subscribes to accounts + transactions via repositories (not direct DB access)
 * - Filters out deleted records
 */
export const useSummary = () => {
    const { isPrivacyMode, setPrivacyMode, defaultCurrency } = useUI();

    const { data, isLoading, version } = useObservable<SummaryData>(
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
                    const now = new Date();
                    const month = now.getMonth();
                    const year = now.getFullYear();
                    const startOfMonth = new Date(year, month, 1).getTime();
                    const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime();

                    const targetCurrency = defaultCurrency || AppConfig.defaultCurrency;

                    const precisionMap = new Map(currencies.map((currency) => [currency.code, currency.precision]));
                    const balancesMap = balanceService.calculateBalancesFromTransactions(accounts, transactions, precisionMap);
                    const balances = Array.from(balancesMap.values());
                    const monthly = await reportService.getIncomeVsExpenseFromTransactions(
                        transactions,
                        accounts,
                        startOfMonth,
                        endOfMonth,
                        targetCurrency
                    );

                    const wealth = await wealthService.calculateSummary(balances, targetCurrency);

                    return {
                        income: monthly.income,
                        expense: monthly.expense,
                        balancesByAccountId: balancesMap,
                        accounts: accounts,
                        ...wealth,
                    };
                } catch (error) {
                    logger.error('Failed to fetch summary:', error);
                    return {
                        income: 0,
                        expense: 0,
                        netWorth: 0,
                        totalAssets: 0,
                        totalLiabilities: 0,
                        totalEquity: 0,
                        totalIncome: 0,
                        totalExpense: 0,
                        accounts: [],
                        balancesByAccountId: new Map(),
                    } as SummaryData;
                }
            })
        ),
        [defaultCurrency],
        {
            income: 0,
            expense: 0,
            netWorth: 0,
            totalAssets: 0,
            totalLiabilities: 0,
            totalEquity: 0,
            totalIncome: 0,
            totalExpense: 0,
            accounts: [],
            balancesByAccountId: new Map(),
        } as SummaryData
    );

    const togglePrivacyMode = () => setPrivacyMode(!isPrivacyMode);

    return {
        ...data,
        isPrivacyMode,
        togglePrivacyMode,
        isLoading,
        version
    };
};
