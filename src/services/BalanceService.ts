import Account, { AccountType } from '@/src/data/models/Account';
import Transaction, { TransactionType } from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { AccountBalance } from '@/src/types/domain';
import { accountingService } from '@/src/utils/accountingService';
import { roundToPrecision } from '@/src/utils/money';

export class BalanceService {
    /**
     * Pure calculation for a single account from an in-memory transaction list.
     * Intended for reactive hooks that already subscribe to transactions.
     */
    calculateAccountBalanceFromTransactions(
        account: Account,
        transactions: Transaction[],
        precision: number,
        asOfDate: number = Date.now()
    ): AccountBalance {
        let balance = 0;
        let monthlyIncome = 0;
        let monthlyExpenses = 0;
        let transactionCount = 0;

        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        const startOfMonthTs = startOfMonth.getTime();

        const multiplierMap: Record<string, number> = {
            [TransactionType.DEBIT]: accountingService.getImpactMultiplier(account.accountType as AccountType, TransactionType.DEBIT),
            [TransactionType.CREDIT]: accountingService.getImpactMultiplier(account.accountType as AccountType, TransactionType.CREDIT)
        };

        for (const tx of transactions) {
            if (tx.accountId !== account.id) continue;
            transactionCount += 1;
            const multiplier = multiplierMap[tx.transactionType] || 0;
            const impact = tx.amount * multiplier;

            balance = roundToPrecision(balance + impact, precision);

            if (tx.transactionDate >= startOfMonthTs) {
                if (impact > 0) {
                    monthlyIncome = roundToPrecision(monthlyIncome + tx.amount, precision);
                } else if (impact < 0) {
                    monthlyExpenses = roundToPrecision(monthlyExpenses + tx.amount, precision);
                }
            }
        }

        return {
            accountId: account.id,
            balance,
            currencyCode: account.currencyCode,
            transactionCount,
            asOfDate,
            accountType: account.accountType as AccountType,
            monthlyIncome,
            monthlyExpenses
        };
    }

    /**
     * Pure calculation for multiple accounts from a shared transaction list.
     */
    calculateBalancesFromTransactions(
        accounts: Account[],
        transactions: Transaction[],
        precisionByCurrency: Map<string, number>,
        asOfDate: number = Date.now()
    ): Map<string, AccountBalance> {
        const result = new Map<string, AccountBalance>();
        if (accounts.length === 0) return result;

        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        const startOfMonthTs = startOfMonth.getTime();

        const accountMap = new Map(accounts.map(account => [account.id, account]));
        const multiplierMap = new Map<string, { debit: number; credit: number }>();
        const precisionMap = new Map<string, number>();

        for (const account of accounts) {
            multiplierMap.set(account.id, {
                debit: accountingService.getImpactMultiplier(account.accountType as AccountType, TransactionType.DEBIT),
                credit: accountingService.getImpactMultiplier(account.accountType as AccountType, TransactionType.CREDIT),
            });
            precisionMap.set(account.id, precisionByCurrency.get(account.currencyCode) ?? 2);
            result.set(account.id, {
                accountId: account.id,
                balance: 0,
                currencyCode: account.currencyCode,
                transactionCount: 0,
                asOfDate,
                accountType: account.accountType as AccountType,
                monthlyIncome: 0,
                monthlyExpenses: 0
            });
        }

        for (const tx of transactions) {
            const account = accountMap.get(tx.accountId);
            if (!account) continue;

            const precision = precisionMap.get(account.id) ?? 2;
            const multipliers = multiplierMap.get(account.id);
            const multiplier = tx.transactionType === TransactionType.DEBIT ? multipliers?.debit : multipliers?.credit;
            const impact = tx.amount * (multiplier ?? 0);

            const current = result.get(account.id);
            if (!current) continue;

            current.balance = roundToPrecision(current.balance + impact, precision);
            current.transactionCount += 1;

            if (tx.transactionDate >= startOfMonthTs) {
                if (impact > 0) {
                    current.monthlyIncome = roundToPrecision(current.monthlyIncome + tx.amount, precision);
                } else if (impact < 0) {
                    current.monthlyExpenses = roundToPrecision(current.monthlyExpenses + tx.amount, precision);
                }
            }
        }

        return result;
    }

    /**
     * Returns an account's balance and transaction count as of a given date.
     * Logic migrated from AccountRepository to centralize balance management.
     * 
     * ⚠️ WARNING: DO NOT USE FOR UI. This is an imperative snapshot. 
     * Use `useAccountBalance` hook for reactive UI updates.
     */
    async getAccountBalance(
        accountId: string,
        cutoffDate: number = Date.now()
    ): Promise<AccountBalance> {
        const account = await accountRepository.find(accountId);
        if (!account) throw new Error(`Account ${accountId} not found`);

        const transactions = await transactionRepository.findForAccountUpToDate(accountId, cutoffDate);
        const precision = await currencyRepository.getPrecision(account.currencyCode);

        let balance = 0;
        for (const tx of transactions) {
            const multiplier = accountingService.getImpactMultiplier(account.accountType as AccountType, tx.transactionType as any);
            balance = roundToPrecision(balance + (tx.amount * multiplier), precision);
        }

        const transactionCount = transactions.length;

        return {
            accountId: account.id,
            balance,
            currencyCode: account.currencyCode,
            transactionCount,
            asOfDate: cutoffDate,
            accountType: account.accountType as AccountType
        };
    }

    /**
     * Gets balances for all active accounts in batch.
     */
    async getAccountBalances(asOfDate?: number): Promise<AccountBalance[]> {
        const accounts = await accountRepository.findAll();
        if (accounts.length === 0) return [];

        const cutoffDate = asOfDate ?? Date.now();

        const balancePromises = accounts.map(async (account): Promise<AccountBalance> => {
            const balanceData = await this.getAccountBalance(account.id, cutoffDate);
            return balanceData;
        });

        return Promise.all(balancePromises);
    }
}

export const balanceService = new BalanceService();
