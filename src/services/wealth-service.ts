import { AppConfig } from '@/src/constants/app-config';
import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { balanceService } from '@/src/services/BalanceService';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { AccountBalance } from '@/src/types/domain';
import { preferences } from '@/src/utils/preferences';
import dayjs from 'dayjs';

export interface WealthSummary {
    netWorth: number;
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
    totalIncome: number;
    totalExpense: number;
}

export interface DailyNetWorth {
    date: number; // Start of day timestamp
    netWorth: number;
    totalAssets: number;
    totalLiabilities: number;
}

/**
 * WealthService - Pure logic for calculating wealth metrics.
 * Follows Rule 1.3: Data-Driven UI (Database is source of truth, service interprets it).
 */
export const wealthService = {
    /**
     * Calculates net worth and category totals from account balances,
     * converting all amounts to the specified target currency.
     */
    async calculateSummary(balances: AccountBalance[], targetCurrency: string): Promise<WealthSummary> {
        let totalAssets = 0;
        let totalLiabilities = 0;
        let totalEquity = 0;
        let totalIncome = 0;
        let totalExpense = 0;

        // Process conversions in parallel for better performance
        await Promise.all(balances.map(async b => {
            const balanceCurrency = b.currencyCode || targetCurrency;
            const { convertedAmount } = await exchangeRateService.convert(
                b.balance,
                balanceCurrency,
                targetCurrency
            );

            if (b.accountType === AccountType.ASSET) {
                totalAssets += convertedAmount;
            } else if (b.accountType === AccountType.LIABILITY) {
                totalLiabilities += convertedAmount;
            } else if (b.accountType === AccountType.EQUITY) {
                totalEquity += convertedAmount;
            } else if (b.accountType === AccountType.INCOME) {
                totalIncome += convertedAmount;
            } else if (b.accountType === AccountType.EXPENSE) {
                totalExpense += convertedAmount;
            }
        }));

        return {
            totalAssets,
            totalLiabilities,
            totalEquity,
            totalIncome,
            totalExpense,
            netWorth: totalAssets - totalLiabilities,
        };
    },

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
            const dayKey = dayjs(tx.transactionDate).format(AppConfig.strings.formats.date);
            if (!txByDay.has(dayKey)) txByDay.set(dayKey, []);
            txByDay.get(dayKey)!.push(tx);
        }

        const history: DailyNetWorth[] = [];
        let cursor = now;

        // 4. Iterate backward from NOW to START
        while (cursor.isAfter(start) || cursor.isSame(start, 'day')) {
            const dayKey = cursor.format(AppConfig.strings.formats.date);

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
};
