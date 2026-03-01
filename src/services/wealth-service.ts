import { AppConfig } from '@/src/constants/app-config';
import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { DailyDelta } from '@/src/data/repositories/TransactionTypes';
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
        // H-5 fix: collect results first, then reduce synchronously.
        // Mutating closed-over variables inside Promise.all is semantically wrong
        // even in single-threaded JS — this pattern makes order non-deterministic.
        const converted = await Promise.all(balances.map(async b => {
            const balanceCurrency = b.currencyCode || targetCurrency;
            const { convertedAmount } = await exchangeRateService.convert(
                b.balance,
                balanceCurrency,
                targetCurrency
            );
            return { type: b.accountType, amount: convertedAmount };
        }));

        let totalAssets = 0;
        let totalLiabilities = 0;
        let totalEquity = 0;
        let totalIncome = 0;
        let totalExpense = 0;

        for (const r of converted) {
            if (r.type === AccountType.ASSET) totalAssets += r.amount;
            else if (r.type === AccountType.LIABILITY) totalLiabilities += r.amount;
            else if (r.type === AccountType.EQUITY) totalEquity += r.amount;
            else if (r.type === AccountType.INCOME) totalIncome += r.amount;
            else if (r.type === AccountType.EXPENSE) totalExpense += r.amount;
        }

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

        // 1. Get current balances and filter for leaf accounts to prevent double-counting
        const allAccounts = await accountRepository.findAll();
        const parentIds = new Set(allAccounts.map((a: { parentAccountId?: string }) => a.parentAccountId).filter(Boolean) as string[]);

        const allBalances = await balanceService.getAccountBalances();
        const relevantBalances = allBalances.filter((a: AccountBalance) =>
            !parentIds.has(a.accountId) &&
            (a.accountType === AccountType.ASSET || a.accountType === AccountType.LIABILITY)
        );

        if (relevantBalances.length === 0) return [];

        // 2. Convert CURRENT state to target currency — collect then reduce (H-5 fix)
        const currentBalances = await Promise.all(relevantBalances.map(async (acc) => {
            const { convertedAmount } = await exchangeRateService.convert(
                acc.balance,
                acc.currencyCode,
                currency
            );
            return { type: acc.accountType, amount: convertedAmount };
        }));

        let runningAssets = 0;
        let runningLiabilities = 0;

        for (const r of currentBalances) {
            if (r.type === AccountType.ASSET) runningAssets += r.amount;
            else if (r.type === AccountType.LIABILITY) runningLiabilities += r.amount;
        }

        // 3. BULK FETCH daily deltas grouped by currency and type (O(1) round-trip, O(M) rows)
        const accountIds = relevantBalances.map(b => b.accountId);
        const deltas: DailyDelta[] = await transactionRawRepository.getDailyDeltasGroupedRaw(
            accountIds,
            start.valueOf(),
            now.valueOf()
        );

        // 4. Group and convert deltas per day
        const dailyDeltas = new Map<string, { assets: number, liabilities: number }>();
        const dateFormat = AppConfig.strings.formats.date;

        // Fetch required exchange rates in one pass for all currencies found in deltas
        const uniqueCurrencies = Array.from(new Set(deltas.map(d => d.currencyCode)));
        const rates = new Map<string, number>();
        await Promise.all(uniqueCurrencies.map(async (c) => {
            const { convertedAmount } = await exchangeRateService.convert(1, c, currency);
            rates.set(c, convertedAmount);
        }));

        if (deltas.length === 0) {
            const accountTypeById = new Map(relevantBalances.map((a) => [a.accountId, a.accountType]));
            const transactions = await transactionRepository.findByAccountsAndDateRange(
                accountIds,
                start.valueOf(),
                now.valueOf()
            );

            const convertedTxs = await Promise.all(transactions.map(async (tx) => {
                const accountType = accountTypeById.get(tx.accountId);
                if (!accountType) return null;

                const { convertedAmount } = await exchangeRateService.convert(
                    tx.amount,
                    tx.currencyCode,
                    currency
                );

                return {
                    dayKey: dayjs(tx.transactionDate).format(dateFormat),
                    accountType,
                    convertedAmount,
                    transactionType: tx.transactionType,
                };
            }));

            for (const tx of convertedTxs) {
                if (!tx) continue;
                const current = dailyDeltas.get(tx.dayKey) || { assets: 0, liabilities: 0 };
                if (tx.accountType === AccountType.ASSET) {
                    current.assets += tx.transactionType === TransactionType.DEBIT
                        ? tx.convertedAmount
                        : -tx.convertedAmount;
                } else {
                    current.liabilities += tx.transactionType === TransactionType.CREDIT
                        ? tx.convertedAmount
                        : -tx.convertedAmount;
                }
                dailyDeltas.set(tx.dayKey, current);
            }
        } else {
            for (const d of deltas) {
                const dayKey = dayjs(d.dayStart).format(dateFormat);
                const rate = rates.get(d.currencyCode) || 1;
                const convertedDelta = d.delta * rate;

                const current = dailyDeltas.get(dayKey) || { assets: 0, liabilities: 0 };
                if (d.accountType === AccountType.ASSET) {
                    current.assets += convertedDelta;
                } else {
                    current.liabilities += convertedDelta;
                }
                dailyDeltas.set(dayKey, current);
            }
        }

        const history: DailyNetWorth[] = [];
        let cursor = now;

        // 5. Iterate backward from NOW to START
        while (cursor.isAfter(start) || cursor.isSame(start, 'day')) {
            const isDayInRange = (cursor.isBefore(end) || cursor.isSame(end, 'day')) &&
                (cursor.isAfter(start) || cursor.isSame(start, 'day'));

            if (isDayInRange) {
                history.push({
                    date: cursor.startOf('day').valueOf(),
                    netWorth: runningAssets - runningLiabilities,
                    totalAssets: runningAssets,
                    totalLiabilities: runningLiabilities
                });
            }

            // Undo transactions for this day
            const dayKey = cursor.format(dateFormat);
            const dayDelta = dailyDeltas.get(dayKey);

            if (dayDelta) {
                runningAssets -= dayDelta.assets;
                runningLiabilities -= dayDelta.liabilities;
            }

            cursor = cursor.subtract(1, 'day');
        }

        return history.reverse();
    }
};
