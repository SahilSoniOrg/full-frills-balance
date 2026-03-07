import { AppConfig } from '@/src/constants/app-config';
import Account, { AccountType } from '@/src/data/models/Account';
import Transaction, { TransactionType } from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { logger } from '@/src/utils/logger';
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
        return this.getBreakdownInternal(AccountType.EXPENSE, startDate, endDate, targetCurrency);
    }

    /**
     * Aggregates income by account for a period.
     */
    async getIncomeBreakdown(startDate: number, endDate: number, targetCurrency?: string): Promise<ExpenseCategory[]> {
        return this.getBreakdownInternal(AccountType.INCOME, startDate, endDate, targetCurrency);
    }

    private async getBreakdownInternal(type: AccountType, startDate: number, endDate: number, targetCurrency?: string): Promise<ExpenseCategory[]> {
        const { currency, incomeAccounts, expenseAccounts } = await this.getReportAccounts(targetCurrency);
        const accounts = type === AccountType.INCOME ? incomeAccounts : expenseAccounts;
        const accountIds = accounts.map(a => a.id);
        const rawDeltas = await transactionRawRepository.getAccountDeltasGroupedRaw(accountIds, startDate, endDate);

        if (rawDeltas.length === 0 && accountIds.length > 0) {
            const convertedTransactions = await this.getConvertedReportTransactions(startDate, endDate, currency, accounts);
            const sums = new Map<string, number>();
            for (const tx of convertedTransactions) {
                const current = sums.get(tx.accountId) || 0;
                const amount = type === AccountType.EXPENSE
                    ? (tx.transactionType === TransactionType.DEBIT ? tx.amount : -tx.amount)
                    : (tx.transactionType === TransactionType.CREDIT ? tx.amount : -tx.amount);
                sums.set(tx.accountId, current + amount);
            }
            return this.buildBreakdownFromSums(accounts, sums);
        }

        const normalized = await this.getNormalizedDeltas(rawDeltas, currency);
        const sums = new Map<string, number>();

        for (const d of normalized) {
            const amount = d.delta;
            sums.set(d.accountId, (sums.get(d.accountId) || 0) + amount);
        }

        return this.buildBreakdownFromSums(accounts, sums);
    }

    /**
     * Calculates Income vs Expense for the period.
     */
    async getIncomeVsExpense(startDate: number, endDate: number, targetCurrency?: string): Promise<{ income: number, expense: number }> {
        const { currency, incomeAccounts, expenseAccounts } = await this.getReportAccounts(targetCurrency);
        const allIds = [...incomeAccounts, ...expenseAccounts].map(a => a.id);
        const rawDeltas = await transactionRawRepository.getAccountDeltasGroupedRaw(allIds, startDate, endDate);

        if (rawDeltas.length === 0 && allIds.length > 0) {
            const convertedTransactions = await this.getConvertedReportTransactions(
                startDate,
                endDate,
                currency,
                [...incomeAccounts, ...expenseAccounts]
            );
            return this.buildIncomeVsExpenseFromConverted(convertedTransactions);
        }

        const normalized = await this.getNormalizedDeltas(rawDeltas, currency);

        const accountTypeMap = new Map([...incomeAccounts, ...expenseAccounts].map(a => [a.id, a.accountType]));
        let income = 0;
        let expense = 0;

        for (const d of normalized) {
            const type = accountTypeMap.get(d.accountId);
            if (type === AccountType.INCOME) {
                income += d.delta;
            } else if (type === AccountType.EXPENSE) {
                expense += d.delta;
            } else {
                logger.error(`[ReportService] Unknown account type for report: ${type} (ID: ${d.accountId})`);
            }
        }

        return { income, expense };
    }

    /**
     * Calculates Income vs Expense from an in-memory transaction list.
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
            if (!acc || (acc.accountType !== AccountType.INCOME && acc.accountType !== AccountType.EXPENSE)) return null;

            const { convertedAmount } = await exchangeRateService.convert(
                tx.amount,
                tx.currencyCode || acc.currencyCode || currency,
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
     * Calculates Income vs Expense history bucketed by month or day.
     */
    async getIncomeVsExpenseHistory(startDate: number, endDate: number, targetCurrency?: string): Promise<IncomeVsExpense[]> {
        const { currency, incomeAccounts, expenseAccounts } = await this.getReportAccounts(targetCurrency);
        const rawDeltas = await transactionRawRepository.getDailyDeltasGroupedRaw(
            [...incomeAccounts, ...expenseAccounts].map(a => a.id),
            startDate,
            endDate
        );

        if (rawDeltas.length === 0 && (incomeAccounts.length + expenseAccounts.length) > 0) {
            const convertedTransactions = await this.getConvertedReportTransactions(
                startDate,
                endDate,
                currency,
                [...incomeAccounts, ...expenseAccounts]
            );
            return this.buildIncomeVsExpenseHistoryFromConverted(convertedTransactions, startDate, endDate);
        }

        const normalized = await this.getNormalizedDeltas(rawDeltas, currency);
        const historyMap = this.initializeHistoryMap(startDate, endDate);
        const { bucketUnit } = this.getHistoryConfig(startDate, endDate);

        for (const d of normalized) {
            const bucketKey = dayjs(d.dayStart).startOf(bucketUnit).valueOf();
            const bucket = historyMap.get(bucketKey);
            if (!bucket) continue;

            if (d.accountType === AccountType.INCOME) {
                bucket.income += d.delta;
            } else if (d.accountType === AccountType.EXPENSE) {
                bucket.expense += d.delta;
            }
        }

        return Array.from(historyMap.values()).sort((a, b) => a.startDate - b.startDate);
    }

    /**
     * Calculates Daily Income vs Expense for the period.
     */
    async getDailyIncomeVsExpense(startDate: number, endDate: number, targetCurrency?: string): Promise<{ date: number, income: number, expense: number }[]> {
        const { currency, incomeAccounts, expenseAccounts } = await this.getReportAccounts(targetCurrency);
        const rawDeltas = await transactionRawRepository.getDailyDeltasGroupedRaw(
            [...incomeAccounts, ...expenseAccounts].map(a => a.id),
            startDate,
            endDate
        );

        if (rawDeltas.length === 0 && (incomeAccounts.length + expenseAccounts.length) > 0) {
            const convertedTransactions = await this.getConvertedReportTransactions(
                startDate,
                endDate,
                currency,
                [...incomeAccounts, ...expenseAccounts]
            );
            return this.buildDailyIncomeVsExpenseFromConverted(convertedTransactions, startDate, endDate);
        }

        const normalized = await this.getNormalizedDeltas(rawDeltas, currency);
        const dailyMap = new Map<number, { income: number; expense: number }>();

        let current = dayjs(startDate).startOf('day');
        const end = dayjs(endDate).endOf('day');
        while (current.isBefore(end) || current.isSame(end, 'day')) {
            dailyMap.set(current.valueOf(), { income: 0, expense: 0 });
            current = current.add(1, 'day');
        }

        for (const d of normalized) {
            const bucket = dailyMap.get(dayjs(d.dayStart).startOf('day').valueOf());
            if (!bucket) continue;

            if (d.accountType === AccountType.INCOME) {
                bucket.income += d.delta;
            } else if (d.accountType === AccountType.EXPENSE) {
                bucket.expense += d.delta;
            }
        }

        return Array.from(dailyMap.entries())
            .map(([date, data]) => ({ date, ...data }))
            .sort((a, b) => a.date - b.date);
    }

    /** Helper to centralize currency conversion and rate caching */
    private async getNormalizedDeltas<T extends { currencyCode: string; delta: number }>(deltas: T[], targetCurrency: string): Promise<T[]> {
        const rates = new Map<string, number>();
        const results = [];

        for (const d of deltas) {
            if (!rates.has(d.currencyCode)) {
                const { convertedAmount } = await exchangeRateService.convert(1, d.currencyCode, targetCurrency);
                rates.set(d.currencyCode, convertedAmount);
            }
            results.push({
                ...d,
                delta: d.delta * (rates.get(d.currencyCode) || 1)
            });
        }
        return results;
    }

    async getReportSnapshot(startDate: number, endDate: number, targetCurrency?: string): Promise<ReportSnapshot> {
        const { currency, incomeAccounts, expenseAccounts } = await this.getReportAccounts(targetCurrency);
        const allAccounts = [...incomeAccounts, ...expenseAccounts];
        const allIds = allAccounts.map((a) => a.id);

        if (allIds.length > 0) {
            const [accountDeltas, dailyDeltas] = await Promise.all([
                transactionRawRepository.getAccountDeltasGroupedRaw(allIds, startDate, endDate),
                transactionRawRepository.getDailyDeltasGroupedRaw(allIds, startDate, endDate),
            ]);

            if (accountDeltas.length === 0 && dailyDeltas.length === 0) {
                const convertedTransactions = await this.getConvertedReportTransactions(
                    startDate,
                    endDate,
                    currency,
                    allAccounts
                );

                return {
                    expenseBreakdown: this.buildBreakdownFromSums(expenseAccounts, this.buildSumsFromConverted(convertedTransactions, AccountType.EXPENSE)),
                    incomeBreakdown: this.buildBreakdownFromSums(incomeAccounts, this.buildSumsFromConverted(convertedTransactions, AccountType.INCOME)),
                    incomeVsExpenseHistory: this.buildIncomeVsExpenseHistoryFromConverted(convertedTransactions, startDate, endDate),
                    incomeVsExpense: this.buildIncomeVsExpenseFromConverted(convertedTransactions),
                    dailyIncomeVsExpense: this.buildDailyIncomeVsExpenseFromConverted(convertedTransactions, startDate, endDate),
                };
            }
        }

        const [
            expenseBreakdown,
            incomeBreakdown,
            incomeVsExpenseHistory,
            incomeVsExpense,
            dailyIncomeVsExpense
        ] = await Promise.all([
            this.getExpenseBreakdown(startDate, endDate, targetCurrency),
            this.getIncomeBreakdown(startDate, endDate, targetCurrency),
            this.getIncomeVsExpenseHistory(startDate, endDate, targetCurrency),
            this.getIncomeVsExpense(startDate, endDate, targetCurrency),
            this.getDailyIncomeVsExpense(startDate, endDate, targetCurrency)
        ]);

        return {
            expenseBreakdown,
            incomeBreakdown,
            incomeVsExpenseHistory,
            incomeVsExpense,
            dailyIncomeVsExpense,
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
        const accountIds = accounts.map((account) => account.id);
        if (accountIds.length === 0) return [];

        const accountTypeById = new Map(accounts.map((account) => [account.id, account.accountType]));
        const accountCurrencyById = new Map(accounts.map((account) => [account.id, account.currencyCode]));
        const transactions = await transactionRepository.findByAccountsAndDateRange(accountIds, startDate, endDate);

        const converted = await Promise.all(transactions.map(async (tx) => {
            const accountType = accountTypeById.get(tx.accountId);
            if (!accountType) return null;

            const { convertedAmount } = await exchangeRateService.convert(
                tx.amount,
                tx.currencyCode || accountCurrencyById.get(tx.accountId) || currency,
                currency
            );

            return {
                accountId: tx.accountId,
                accountType,
                transactionType: tx.transactionType,
                transactionDate: tx.transactionDate,
                amount: convertedAmount,
            } as ConvertedReportTransaction;
        }));

        return converted.filter((row): row is ConvertedReportTransaction => !!row);
    }

    private buildSumsFromConverted(
        convertedTransactions: ConvertedReportTransaction[],
        accountType: AccountType
    ): Map<string, number> {
        const sums = new Map<string, number>();
        for (const tx of convertedTransactions) {
            if (tx.accountType !== accountType) continue;
            const current = sums.get(tx.accountId) || 0;
            const delta = accountType === AccountType.EXPENSE
                ? (tx.transactionType === TransactionType.DEBIT ? tx.amount : -tx.amount)
                : (tx.transactionType === TransactionType.CREDIT ? tx.amount : -tx.amount);
            sums.set(tx.accountId, current + delta);
        }
        return sums;
    }

    private buildBreakdownFromSums(
        scopedAccounts: ReportAccount[],
        sums: Map<string, number>
    ): ExpenseCategory[] {
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
        const historyMap = this.initializeHistoryMap(startDate, endDate);
        const { bucketUnit } = this.getHistoryConfig(startDate, endDate);

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

    private getHistoryConfig(startDate: number, endDate: number) {
        const start = dayjs(startDate);
        const end = dayjs(endDate);
        const diffDays = end.diff(start, 'day');
        const monthlyThreshold = AppConfig.defaults.reportMonthlyBucketThresholdDays;
        const bucketUnit: 'day' | 'month' = diffDays > monthlyThreshold ? 'month' : 'day';
        const format = diffDays > monthlyThreshold ? 'MMM YYYY' : 'DD MMM';
        return { bucketUnit, format };
    }

    private initializeHistoryMap(startDate: number, endDate: number): Map<number, IncomeVsExpense> {
        const historyMap = new Map<number, IncomeVsExpense>();
        const start = dayjs(startDate);
        const end = dayjs(endDate);
        const { bucketUnit, format } = this.getHistoryConfig(startDate, endDate);

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
        return historyMap;
    }
}

export const reportService = new ReportService();
