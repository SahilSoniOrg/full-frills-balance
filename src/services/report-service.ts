import { AppConfig } from '@/src/constants/app-config';
import Account, { AccountType } from '@/src/data/models/Account';
import Transaction, { TransactionType } from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { balanceService } from '@/src/services/BalanceService';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { preferences } from '@/src/utils/preferences';
import dayjs from 'dayjs';

export interface DailyNetWorth {
    date: number; // Start of day timestamp
    netWorth: number;
    totalAssets: number;
    totalLiabilities: number;
}

export interface ExpenseCategory {
    accountId: string;
    accountName: string;
    amount: number;
    percentage: number;
    color?: string; // For chart
}

export interface IncomeVsExpense {
    period: string; // Label (e.g., "Jan", "Week 1")
    income: number;
    expense: number;
}

export class ReportService {
    /**
     * Calculates Net Worth history for the specified date range.
     * 
     * ALGORITHM: "Rewind"
     * 1. Get current balances for all ASSET and LIABILITY accounts.
     * 2. Convert all current balances to the target currency.
     * 3. Fetch ALL relevant transactions for these accounts from START till NOW in ONE query.
     * 4. Iterate backward day-by-day using dayjs, "undoing" transactions.
     * 5. Record snapshots for the requested range.
     */
    async getNetWorthHistory(startDate: number, endDate: number, targetCurrency?: string): Promise<DailyNetWorth[]> {
        const currency = targetCurrency || preferences.defaultCurrencyCode || AppConfig.defaultCurrency;

        const start = dayjs(startDate).startOf('day');
        const end = dayjs(endDate).endOf('day');
        const now = dayjs().endOf('day');

        // 1. Get current balances
        const allBalances = await balanceService.getAccountBalances();
        const relevantBalances = allBalances.filter(a =>
            a.accountType === AccountType.ASSET || a.accountType === AccountType.LIABILITY
        );

        if (relevantBalances.length === 0) return [];

        // 2. Convert CURRENT state to target currency
        let runningAssets = 0;
        let runningLiabilities = 0;

        await Promise.all(relevantBalances.map(async (acc) => {
            const { convertedAmount } = await exchangeRateService.convert(
                acc.balance,
                acc.currencyCode,
                currency
            );
            if (acc.accountType === AccountType.ASSET) {
                runningAssets += convertedAmount;
            } else {
                runningLiabilities += convertedAmount;
            }
        }));

        // 3. BULK FETCH all transactions needed for the rewind (from start till now)
        const accountIds = relevantBalances.map(b => b.accountId);
        const transactions = await transactionRepository.findByAccountsAndDateRange(
            accountIds,
            start.valueOf(),
            now.valueOf()
        );

        // Group transactions by date for efficient lookup during rewind
        const txByDay = new Map<string, any[]>();
        for (const tx of transactions) {
            const dayKey = dayjs(tx.transactionDate).format('YYYY-MM-DD');
            if (!txByDay.has(dayKey)) txByDay.set(dayKey, []);
            txByDay.get(dayKey)!.push(tx);
        }

        const history: DailyNetWorth[] = [];
        let cursor = now;

        // 4. Iterate backward from NOW to START
        while (cursor.isAfter(start) || cursor.isSame(start, 'day')) {
            const dayKey = cursor.format('YYYY-MM-DD');

            // Save snapshot if in target range
            if ((cursor.isBefore(end) || cursor.isSame(end, 'day')) &&
                (cursor.isAfter(start) || cursor.isSame(start, 'day'))) {
                history.push({
                    date: cursor.startOf('day').valueOf(),
                    netWorth: runningAssets - runningLiabilities,
                    totalAssets: runningAssets,
                    totalLiabilities: runningLiabilities
                });
            }

            // Undo transactions for this day in parallel
            const dayTxs = txByDay.get(dayKey) || [];
            if (dayTxs.length > 0) {
                const dayConversions = await Promise.all(dayTxs.map(async (tx) => {
                    const acc = relevantBalances.find(a => a.accountId === tx.accountId);
                    if (!acc) return null;

                    const txCurrency = tx.currencyCode || acc.currencyCode || currency;
                    const { convertedAmount } = await exchangeRateService.convert(
                        tx.amount,
                        txCurrency,
                        currency
                    );
                    return { convertedAmount, type: acc.accountType, transactionType: tx.transactionType };
                }));

                for (const conv of dayConversions) {
                    if (!conv) continue;
                    if (conv.type === AccountType.ASSET) {
                        runningAssets += conv.transactionType === TransactionType.DEBIT ? -conv.convertedAmount : conv.convertedAmount;
                    } else {
                        runningLiabilities += conv.transactionType === TransactionType.CREDIT ? -conv.convertedAmount : conv.convertedAmount;
                    }
                }
            }

            cursor = cursor.subtract(1, 'day');
        }

        return history.reverse();
    }

    /**
     * Aggregates expenses by account for a period.
     */
    async getExpenseBreakdown(startDate: number, endDate: number, targetCurrency?: string): Promise<ExpenseCategory[]> {
        const currency = targetCurrency || preferences.defaultCurrencyCode || AppConfig.defaultCurrency;
        const expenseAccounts = await accountRepository.findByType(AccountType.EXPENSE);
        if (expenseAccounts.length === 0) return [];

        const accountIds = expenseAccounts.map(a => a.id);
        const transactions = await transactionRepository.findByAccountsAndDateRange(accountIds, startDate, endDate);

        const sums = new Map<string, number>();
        let totalExpense = 0;

        for (const tx of transactions) {
            const txCurrency = tx.currencyCode || currency;
            const { convertedAmount } = await exchangeRateService.convert(
                tx.amount,
                txCurrency,
                currency
            );

            const current = sums.get(tx.accountId) || 0;
            const change = tx.transactionType === TransactionType.DEBIT ? convertedAmount : -convertedAmount;
            sums.set(tx.accountId, current + change);
            totalExpense += change;
        }

        const result: ExpenseCategory[] = [];
        expenseAccounts.forEach(acc => {
            const amount = sums.get(acc.id) || 0;
            if (amount > 0) {
                result.push({
                    accountId: acc.id,
                    accountName: acc.name,
                    amount,
                    percentage: totalExpense > 0 ? (amount / totalExpense) * 100 : 0
                });
            }
        });

        return result.sort((a, b) => b.amount - a.amount);
    }

    /**
     * Calculates Income vs Expense for the period.
     */
    async getIncomeVsExpense(startDate: number, endDate: number, targetCurrency?: string): Promise<{ income: number, expense: number }> {
        const currency = targetCurrency || preferences.defaultCurrencyCode || AppConfig.defaultCurrency;
        const incomeAccounts = await accountRepository.findByType(AccountType.INCOME);
        const expenseAccounts = await accountRepository.findByType(AccountType.EXPENSE);

        const allReportAccounts = [...incomeAccounts, ...expenseAccounts];
        const accountIds = allReportAccounts.map(a => a.id);

        const transactions = await transactionRepository.findByAccountsAndDateRange(accountIds, startDate, endDate);

        return this.getIncomeVsExpenseFromTransactions(transactions, allReportAccounts, startDate, endDate, currency);
    }

    /**
     * Calculates Income vs Expense from an in-memory transaction list.
     * Useful for reactive hooks that already subscribe to transactions.
     */
    async getIncomeVsExpenseFromTransactions(
        transactions: Transaction[],
        accounts: Account[],
        startDate: number,
        endDate: number,
        targetCurrency?: string
    ): Promise<{ income: number, expense: number }> {
        const currency = targetCurrency || preferences.defaultCurrencyCode || AppConfig.defaultCurrency;
        const accountMap = new Map(accounts.map(a => [a.id, a]));

        let income = 0;
        let expense = 0;

        const conversions = await Promise.all(transactions.map(async (tx) => {
            if (tx.transactionDate < startDate || tx.transactionDate > endDate) return null;
            const acc = accountMap.get(tx.accountId);
            if (!acc) return null;
            if (acc.accountType !== AccountType.INCOME && acc.accountType !== AccountType.EXPENSE) return null;

            const txCurrency = tx.currencyCode || acc.currencyCode || currency;
            const { convertedAmount } = await exchangeRateService.convert(
                tx.amount,
                txCurrency,
                currency
            );

            return {
                amount: convertedAmount,
                type: acc.accountType,
                transactionType: tx.transactionType
            };
        }));

        for (const conv of conversions) {
            if (!conv) continue;
            if (conv.type === AccountType.INCOME) {
                income += conv.transactionType === TransactionType.CREDIT ? conv.amount : -conv.amount;
            } else {
                expense += conv.transactionType === TransactionType.DEBIT ? conv.amount : -conv.amount;
            }
        }

        return { income, expense };
    }
}

export const reportService = new ReportService();
