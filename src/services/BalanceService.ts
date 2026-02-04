import { AccountType } from '@/src/data/models/Account';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { AccountBalance } from '@/src/types/domain';
import { accountingService } from '@/src/utils/accountingService';
import { roundToPrecision } from '@/src/utils/money';

export class BalanceService {
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
