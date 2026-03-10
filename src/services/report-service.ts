import { AppConfig } from '@/src/constants/app-config';
import Account, { AccountType } from '@/src/data/models/Account';
import Transaction, { TransactionType } from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { logger } from '@/src/utils/logger';
import { Money } from '@/src/utils/money';
import { preferences } from '@/src/utils/preferences';
import dayjs from 'dayjs';
import { from, Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';

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

    /**
     * Reactive version of getExpenseBreakdown.
     */
    observeExpenseBreakdown(startDate: number, endDate: number, targetCurrency?: string): Observable<ExpenseCategory[]> {
        return transactionRepository.observeActive().pipe(
            switchMap(() => from(this.getExpenseBreakdown(startDate, endDate, targetCurrency)))
        );
    }

    /**
     * Reactive version of getIncomeBreakdown.
     */
    observeIncomeBreakdown(startDate: number, endDate: number, targetCurrency?: string): Observable<ExpenseCategory[]> {
        return transactionRepository.observeActive().pipe(
            switchMap(() => from(this.getIncomeBreakdown(startDate, endDate, targetCurrency)))
        );
    }

    private async getBreakdownInternal(type: AccountType, startDate: number, endDate: number, targetCurrency?: string): Promise<ExpenseCategory[]> {
        const { currency, incomeAccounts, expenseAccounts } = await this.getReportAccounts(targetCurrency);
        const accounts = type === AccountType.INCOME ? incomeAccounts : expenseAccounts;
        const accountIds = accounts.map(a => a.id);
        const rawDeltas = await transactionRawRepository.getAccountDeltasGroupedRaw(accountIds, startDate, endDate);

        if (rawDeltas.length === 0 && accountIds.length > 0) {
            const convertedTransactions = await this.getConvertedReportTransactions(startDate, endDate, currency, accounts);
            const sums = new Map<string, Money>();
            for (const tx of convertedTransactions) {
                const current = sums.get(tx.accountId) || Money.from(0, currency);
                const delta = type === AccountType.EXPENSE
                    ? (tx.transactionType === TransactionType.DEBIT ? Money.from(tx.amount, currency) : Money.from(-tx.amount, currency))
                    : (tx.transactionType === TransactionType.CREDIT ? Money.from(tx.amount, currency) : Money.from(-tx.amount, currency));
                sums.set(tx.accountId, current.add(delta));
            }
            return this.buildBreakdownFromSums(accounts, sums);
        }

        const normalized = await this.getNormalizedDeltas(rawDeltas, currency);
        const sums = new Map<string, Money>();

        for (const d of normalized) {
            const delta = Money.from(d.delta, currency);
            sums.set(d.accountId, (sums.get(d.accountId) || Money.from(0, currency)).add(delta));
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
            return this.buildIncomeVsExpenseFromConverted(convertedTransactions, currency);
        }

        const normalized = await this.getNormalizedDeltas(rawDeltas, currency);

        const accountTypeMap = new Map([...incomeAccounts, ...expenseAccounts].map(a => [a.id, a.accountType]));
        let income = Money.from(0, currency);
        let expense = Money.from(0, currency);

        for (const d of normalized) {
            const type = accountTypeMap.get(d.accountId);
            const delta = Money.from(d.delta, currency);
            if (type === AccountType.INCOME) {
                income = income.add(delta);
            } else if (type === AccountType.EXPENSE) {
                expense = expense.add(delta);
            } else {
                logger.error(`[ReportService] Unknown account type for report: ${type} (ID: ${d.accountId})`);
            }
        }

        return { income: income.amount, expense: expense.amount };
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

        let income = Money.from(0, currency);
        let expense = Money.from(0, currency);

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
                amount: Money.from(convertedAmount, currency),
                type: acc.accountType,
                transactionType: tx.transactionType
            };
        }));

        for (const conv of conversions) {
            if (!conv) continue;
            if (conv.type === AccountType.INCOME) {
                const delta = conv.transactionType === TransactionType.CREDIT ? conv.amount : Money.from(-conv.amount.amount, currency);
                income = income.add(delta);
            } else {
                const delta = conv.transactionType === TransactionType.DEBIT ? conv.amount : Money.from(-conv.amount.amount, currency);
                expense = expense.add(delta);
            }
        }

        return { income: income.amount, expense: expense.amount };
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
            return this.buildIncomeVsExpenseHistoryFromConverted(convertedTransactions, startDate, endDate, currency);
        }

        const normalized = await this.getNormalizedDeltas(rawDeltas, currency);
        const historyMap = this.initializeHistoryMap(startDate, endDate);
        const { bucketUnit } = this.getHistoryConfig(startDate, endDate);

        for (const d of normalized) {
            const bucketKey = dayjs(d.dayStart).startOf(bucketUnit).valueOf();
            const bucket = historyMap.get(bucketKey);
            if (!bucket) continue;

            const delta = Money.from(d.delta, currency);
            if (d.accountType === AccountType.INCOME) {
                bucket.income = Money.from(bucket.income, currency).add(delta).amount;
            } else if (d.accountType === AccountType.EXPENSE) {
                bucket.expense = Money.from(bucket.expense, currency).add(delta).amount;
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
            return this.buildDailyIncomeVsExpenseFromConverted(convertedTransactions, startDate, endDate, currency);
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

            const delta = Money.from(d.delta, currency);
            if (d.accountType === AccountType.INCOME) {
                bucket.income = Money.from(bucket.income, currency).add(delta).amount;
            } else if (d.accountType === AccountType.EXPENSE) {
                bucket.expense = Money.from(bucket.expense, currency).add(delta).amount;
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
                    expenseBreakdown: this.buildBreakdownFromSums(expenseAccounts, this.buildSumsFromConverted(convertedTransactions, AccountType.EXPENSE, currency)),
                    incomeBreakdown: this.buildBreakdownFromSums(incomeAccounts, this.buildSumsFromConverted(convertedTransactions, AccountType.INCOME, currency)),
                    incomeVsExpenseHistory: this.buildIncomeVsExpenseHistoryFromConverted(convertedTransactions, startDate, endDate, currency),
                    incomeVsExpense: this.buildIncomeVsExpenseFromConverted(convertedTransactions, currency),
                    dailyIncomeVsExpense: this.buildDailyIncomeVsExpenseFromConverted(convertedTransactions, startDate, endDate, currency),
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

    /**
     * Reactive version of getReportSnapshot.
     */
    observeReportSnapshot(startDate: number, endDate: number, targetCurrency?: string): Observable<ReportSnapshot> {
        return transactionRepository.observeActive().pipe(
            switchMap(() => from(this.getReportSnapshot(startDate, endDate, targetCurrency)))
        );
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
        accountType: AccountType,
        currency: string
    ): Map<string, Money> {
        const sums = new Map<string, Money>();
        for (const tx of convertedTransactions) {
            if (tx.accountType !== accountType) continue;
            const current = sums.get(tx.accountId) || Money.from(0, currency);
            const delta = accountType === AccountType.EXPENSE
                ? (tx.transactionType === TransactionType.DEBIT ? Money.from(tx.amount, currency) : Money.from(-tx.amount, currency))
                : (tx.transactionType === TransactionType.CREDIT ? Money.from(tx.amount, currency) : Money.from(-tx.amount, currency));
            sums.set(tx.accountId, current.add(delta));
        }
        return sums;
    }

    private buildBreakdownFromSums(
        scopedAccounts: ReportAccount[],
        sums: Map<string, Money>
    ): ExpenseCategory[] {
        const result: ExpenseCategory[] = [];
        let totalPositiveAmount = 0;
        for (const account of scopedAccounts) {
            const m = sums.get(account.id) || Money.from(0);
            if (m.amount > 0) {
                result.push({
                    accountId: account.id,
                    accountName: account.name,
                    amount: m.amount,
                    percentage: 0,
                });
                totalPositiveAmount += m.amount;
            }
        }

        result.forEach((item) => {
            item.percentage = totalPositiveAmount > 0 ? (item.amount / totalPositiveAmount) * 100 : 0;
        });
        return result.sort((a, b) => b.amount - a.amount);
    }

    private buildIncomeVsExpenseFromConverted(convertedTransactions: ConvertedReportTransaction[], currency: string): { income: number; expense: number } {
        let income = Money.from(0, currency);
        let expense = Money.from(0, currency);
        for (const tx of convertedTransactions) {
            const m = Money.from(tx.amount, currency);
            if (tx.accountType === AccountType.INCOME) {
                const delta = tx.transactionType === TransactionType.CREDIT ? m : Money.from(-m.amount, currency);
                income = income.add(delta);
            } else if (tx.accountType === AccountType.EXPENSE) {
                const delta = tx.transactionType === TransactionType.DEBIT ? m : Money.from(-m.amount, currency);
                expense = expense.add(delta);
            }
        }
        return { income: income.amount, expense: expense.amount };
    }

    private buildIncomeVsExpenseHistoryFromConverted(
        convertedTransactions: ConvertedReportTransaction[],
        startDate: number,
        endDate: number,
        currency: string
    ): IncomeVsExpense[] {
        const historyMap = this.initializeHistoryMap(startDate, endDate);
        const { bucketUnit } = this.getHistoryConfig(startDate, endDate);

        for (const tx of convertedTransactions) {
            const bucketKey = dayjs(tx.transactionDate).startOf(bucketUnit).valueOf();
            const bucket = historyMap.get(bucketKey);
            if (!bucket) continue;

            const m = Money.from(tx.amount, currency);
            if (tx.accountType === AccountType.INCOME) {
                const delta = tx.transactionType === TransactionType.CREDIT ? m : Money.from(-m.amount, currency);
                bucket.income = Money.from(bucket.income, currency).add(delta).amount;
            } else if (tx.accountType === AccountType.EXPENSE) {
                const delta = tx.transactionType === TransactionType.DEBIT ? m : Money.from(-m.amount, currency);
                bucket.expense = Money.from(bucket.expense, currency).add(delta).amount;
            }
        }

        return Array.from(historyMap.values()).sort((a, b) => a.startDate - b.startDate);
    }

    private buildDailyIncomeVsExpenseFromConverted(
        convertedTransactions: ConvertedReportTransaction[],
        startDate: number,
        endDate: number,
        currency: string
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

            const m = Money.from(tx.amount, currency);
            if (tx.accountType === AccountType.INCOME) {
                const delta = tx.transactionType === TransactionType.CREDIT ? m : Money.from(-m.amount, currency);
                bucket.income = Money.from(bucket.income, currency).add(delta).amount;
            } else if (tx.accountType === AccountType.EXPENSE) {
                const delta = tx.transactionType === TransactionType.DEBIT ? m : Money.from(-m.amount, currency);
                bucket.expense = Money.from(bucket.expense, currency).add(delta).amount;
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
