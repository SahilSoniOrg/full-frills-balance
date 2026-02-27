import { AppConfig } from '@/src/constants/app-config';
import Account, { AccountType } from '@/src/data/models/Account';
import Transaction, { TransactionType } from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { preferences } from '@/src/utils/preferences';
import dayjs from 'dayjs';

export interface ExpenseCategory {
    accountId: string;
    accountName: string;
    amount: number;
    percentage: number;
    color?: string; // For chart
}

export interface IncomeVsExpense {
    period: string; // Label (e.g., "Jan", "Week 1")
    startDate: number;
    endDate: number;
    income: number;
    expense: number;
}

export interface ReportSnapshot {
    expenseBreakdown: ExpenseCategory[];
    incomeBreakdown: ExpenseCategory[];
    incomeVsExpenseHistory: IncomeVsExpense[];
    incomeVsExpense: { income: number; expense: number };
    dailyIncomeVsExpense: { date: number; income: number; expense: number }[];
}

interface ConvertedReportTransaction {
    accountId: string;
    accountType: AccountType;
    transactionType: TransactionType;
    transactionDate: number;
    amount: number;
}

interface ReportAccount {
    id: string;
    name: string;
    currencyCode?: string;
    accountType: AccountType;
}

export class ReportService {
    /**
     * Aggregates expenses by account for a period.
     */
    async getExpenseBreakdown(startDate: number, endDate: number, targetCurrency?: string): Promise<ExpenseCategory[]> {
        const { currency, expenseAccounts } = await this.getReportAccounts(targetCurrency);
        const convertedTransactions = await this.getConvertedReportTransactions(startDate, endDate, currency, expenseAccounts);
        return this.buildBreakdown(expenseAccounts, convertedTransactions, AccountType.EXPENSE);
    }

    /**
     * Calculates Income vs Expense for the period.
     */
    async getIncomeVsExpense(startDate: number, endDate: number, targetCurrency?: string): Promise<{ income: number, expense: number }> {
        const { currency, incomeAccounts, expenseAccounts } = await this.getReportAccounts(targetCurrency);
        const convertedTransactions = await this.getConvertedReportTransactions(startDate, endDate, currency, [...incomeAccounts, ...expenseAccounts]);
        return this.buildIncomeVsExpenseFromConverted(convertedTransactions);
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

    /**
     * Aggregates income by account for a period.
     */
    async getIncomeBreakdown(startDate: number, endDate: number, targetCurrency?: string): Promise<ExpenseCategory[]> {
        const { currency, incomeAccounts } = await this.getReportAccounts(targetCurrency);
        const convertedTransactions = await this.getConvertedReportTransactions(startDate, endDate, currency, incomeAccounts);
        return this.buildBreakdown(incomeAccounts, convertedTransactions, AccountType.INCOME);
    }

    /**
     * Calculates Income vs Expense history bucketed by month or day.
     */
    async getIncomeVsExpenseHistory(startDate: number, endDate: number, targetCurrency?: string): Promise<IncomeVsExpense[]> {
        const { currency, incomeAccounts, expenseAccounts } = await this.getReportAccounts(targetCurrency);
        const convertedTransactions = await this.getConvertedReportTransactions(startDate, endDate, currency, [...incomeAccounts, ...expenseAccounts]);
        return this.buildIncomeVsExpenseHistoryFromConverted(convertedTransactions, startDate, endDate);
    }

    /**
     * Calculates Daily Income vs Expense for the period.
     * Guaranteed 1-day granularity for mapping to Net Worth chart.
     */
    async getDailyIncomeVsExpense(startDate: number, endDate: number, targetCurrency?: string): Promise<{ date: number, income: number, expense: number }[]> {
        const { currency, incomeAccounts, expenseAccounts } = await this.getReportAccounts(targetCurrency);
        const convertedTransactions = await this.getConvertedReportTransactions(startDate, endDate, currency, [...incomeAccounts, ...expenseAccounts]);
        return this.buildDailyIncomeVsExpenseFromConverted(convertedTransactions, startDate, endDate);
    }

    /**
     * Consolidated report payload for dashboards/hooks that need multiple projections
     * for the same range. This avoids repeated account queries and currency conversions.
     */
    async getReportSnapshot(startDate: number, endDate: number, targetCurrency?: string): Promise<ReportSnapshot> {
        const { currency, incomeAccounts, expenseAccounts } = await this.getReportAccounts(targetCurrency);
        const reportAccounts = [...incomeAccounts, ...expenseAccounts];
        const convertedTransactions = await this.getConvertedReportTransactions(startDate, endDate, currency, reportAccounts);

        return {
            expenseBreakdown: this.buildBreakdown(expenseAccounts, convertedTransactions, AccountType.EXPENSE),
            incomeBreakdown: this.buildBreakdown(incomeAccounts, convertedTransactions, AccountType.INCOME),
            incomeVsExpenseHistory: this.buildIncomeVsExpenseHistoryFromConverted(convertedTransactions, startDate, endDate),
            incomeVsExpense: this.buildIncomeVsExpenseFromConverted(convertedTransactions),
            dailyIncomeVsExpense: this.buildDailyIncomeVsExpenseFromConverted(convertedTransactions, startDate, endDate),
        };
    }

    private async getReportAccounts(targetCurrency?: string): Promise<{
        currency: string;
        incomeAccounts: ReportAccount[];
        expenseAccounts: ReportAccount[];
    }> {
        const currency = targetCurrency || preferences.defaultCurrencyCode || AppConfig.defaultCurrency;
        const [rawIncomeAccounts, rawExpenseAccounts] = await Promise.all([
            accountRepository.findByType(AccountType.INCOME),
            accountRepository.findByType(AccountType.EXPENSE),
        ]);

        const incomeAccounts = rawIncomeAccounts.map((account) => ({
            id: account.id,
            name: account.name,
            currencyCode: account.currencyCode,
            accountType: AccountType.INCOME,
        }));
        const expenseAccounts = rawExpenseAccounts.map((account) => ({
            id: account.id,
            name: account.name,
            currencyCode: account.currencyCode,
            accountType: AccountType.EXPENSE,
        }));

        return { currency, incomeAccounts, expenseAccounts };
    }

    private async getConvertedReportTransactions(
        startDate: number,
        endDate: number,
        currency: string,
        accounts: ReportAccount[]
    ): Promise<ConvertedReportTransaction[]> {
        const accountMap = new Map<string, ReportAccount>();
        for (const account of accounts) {
            if (!accountMap.has(account.id)) {
                accountMap.set(account.id, account);
            }
        }
        const accountIds = accounts.map((account) => account.id);
        if (accountIds.length === 0) {
            return [];
        }

        const transactions = await transactionRepository.findByAccountsAndDateRange(accountIds, startDate, endDate);

        // Group transactions by currency to fetch exchange rates efficiently
        const transactionsByCurrency = new Map<string, typeof transactions>();
        for (const tx of transactions) {
            const account = accountMap.get(tx.accountId);
            if (!account) continue;
            const txCurrency = tx.currencyCode || account.currencyCode || currency;
            const group = transactionsByCurrency.get(txCurrency);
            if (group) {
                group.push(tx);
            } else {
                transactionsByCurrency.set(txCurrency, [tx]);
            }
        }

        // Fetch rates concurrently for each unique currency (K unique currencies vs N transactions)
        const currencyRates = new Map<string, number>();
        await Promise.all(
            Array.from(transactionsByCurrency.keys()).map(async (txCurrency) => {
                if (txCurrency === currency) {
                    currencyRates.set(txCurrency, 1);
                } else {
                    const { convertedAmount } = await exchangeRateService.convert(1, txCurrency, currency);
                    currencyRates.set(txCurrency, convertedAmount);
                }
            })
        );

        // Apply conversions synchronously
        const convertedTransactions: ConvertedReportTransaction[] = [];
        for (const [txCurrency, txs] of transactionsByCurrency.entries()) {
            const rate = currencyRates.get(txCurrency) || 1;
            for (const tx of txs) {
                const account = accountMap.get(tx.accountId)!;
                convertedTransactions.push({
                    accountId: tx.accountId,
                    accountType: account.accountType,
                    transactionType: tx.transactionType,
                    transactionDate: tx.transactionDate,
                    amount: tx.amount * rate,
                });
            }
        }

        return convertedTransactions;
    }

    private buildBreakdown(
        scopedAccounts: ReportAccount[],
        convertedTransactions: ConvertedReportTransaction[],
        accountType: AccountType
    ): ExpenseCategory[] {
        if (scopedAccounts.length === 0) return [];

        const sums = new Map<string, number>();
        for (const tx of convertedTransactions) {
            if (tx.accountType !== accountType) continue;
            const current = sums.get(tx.accountId) || 0;
            const change = accountType === AccountType.EXPENSE
                ? (tx.transactionType === TransactionType.DEBIT ? tx.amount : -tx.amount)
                : (tx.transactionType === TransactionType.CREDIT ? tx.amount : -tx.amount);
            sums.set(tx.accountId, current + change);
        }

        const result: ExpenseCategory[] = [];
        let totalPositiveAmount = 0;
        for (const account of scopedAccounts) {
            const amount = sums.get(account.id) || 0;
            if (amount > 0) {
                result.push({
                    accountId: account.id,
                    accountName: account.name,
                    amount,
                    percentage: 0,
                });
                totalPositiveAmount += amount;
            }
        }

        result.forEach((item) => {
            item.percentage = totalPositiveAmount > 0 ? (item.amount / totalPositiveAmount) * 100 : 0;
        });
        return result.sort((a, b) => b.amount - a.amount);
    }

    private buildIncomeVsExpenseFromConverted(convertedTransactions: ConvertedReportTransaction[]): { income: number; expense: number } {
        let income = 0;
        let expense = 0;
        for (const tx of convertedTransactions) {
            if (tx.accountType === AccountType.INCOME) {
                income += tx.transactionType === TransactionType.CREDIT ? tx.amount : -tx.amount;
            } else if (tx.accountType === AccountType.EXPENSE) {
                expense += tx.transactionType === TransactionType.DEBIT ? tx.amount : -tx.amount;
            }
        }
        return { income, expense };
    }

    private buildIncomeVsExpenseHistoryFromConverted(
        convertedTransactions: ConvertedReportTransaction[],
        startDate: number,
        endDate: number
    ): IncomeVsExpense[] {
        const historyMap = new Map<number, IncomeVsExpense>();
        const start = dayjs(startDate);
        const end = dayjs(endDate);
        const diffDays = end.diff(start, 'day');
        const bucketUnit: 'day' | 'month' = diffDays > 60 ? 'month' : 'day';
        const format = diffDays > 60 ? 'MMM YYYY' : 'DD MMM';

        let current = start.startOf(bucketUnit);
        while (current.isBefore(end) || current.isSame(end, bucketUnit)) {
            const bucketStart = current.startOf(bucketUnit).valueOf();
            const bucketEnd = current.endOf(bucketUnit).valueOf();
            historyMap.set(bucketStart, {
                period: current.format(format),
                startDate: Math.max(bucketStart, startDate),
                endDate: Math.min(bucketEnd, endDate),
                income: 0,
                expense: 0,
            });
            current = current.add(1, bucketUnit);
        }

        for (const tx of convertedTransactions) {
            const bucketKey = dayjs(tx.transactionDate).startOf(bucketUnit).valueOf();
            const bucket = historyMap.get(bucketKey);
            if (!bucket) continue;

            if (tx.accountType === AccountType.INCOME) {
                bucket.income += tx.transactionType === TransactionType.CREDIT ? tx.amount : -tx.amount;
            } else if (tx.accountType === AccountType.EXPENSE) {
                bucket.expense += tx.transactionType === TransactionType.DEBIT ? tx.amount : -tx.amount;
            }
        }

        return Array.from(historyMap.values()).sort((a, b) => a.startDate - b.startDate);
    }

    private buildDailyIncomeVsExpenseFromConverted(
        convertedTransactions: ConvertedReportTransaction[],
        startDate: number,
        endDate: number
    ): { date: number; income: number; expense: number }[] {
        const dailyMap = new Map<number, { income: number; expense: number }>();
        const start = dayjs(startDate).startOf('day');
        const end = dayjs(endDate).endOf('day');

        let current = start;
        while (current.isBefore(end) || current.isSame(end, 'day')) {
            dailyMap.set(current.valueOf(), { income: 0, expense: 0 });
            current = current.add(1, 'day');
        }

        for (const tx of convertedTransactions) {
            const bucket = dailyMap.get(dayjs(tx.transactionDate).startOf('day').valueOf());
            if (!bucket) continue;

            if (tx.accountType === AccountType.INCOME) {
                bucket.income += tx.transactionType === TransactionType.CREDIT ? tx.amount : -tx.amount;
            } else if (tx.accountType === AccountType.EXPENSE) {
                bucket.expense += tx.transactionType === TransactionType.DEBIT ? tx.amount : -tx.amount;
            }
        }

        return Array.from(dailyMap.entries())
            .map(([date, data]) => ({ date, ...data }))
            .sort((a, b) => a.date - b.date);
    }
}

export const reportService = new ReportService();
