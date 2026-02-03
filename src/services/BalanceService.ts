import { AccountType } from '@/src/data/models/Account';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { AccountBalance } from '@/src/types/domain';

export class BalanceService {
    /**
     * Returns an account's balance and transaction count as of a given date.
     * Logic migrated from AccountRepository to centralize balance management.
     */
    async getAccountBalance(
        accountId: string,
        cutoffDate: number = Date.now()
    ): Promise<AccountBalance> {
        const account = await accountRepository.find(accountId);
        if (!account) throw new Error(`Account ${accountId} not found`);

        // 1. Get running balance from latest transaction before or at cutoff
        const latestTxs = await transactionRepository.findLatestForAccount(accountId, cutoffDate);
        const balance = latestTxs?.runningBalance || 0;

        // 2. Get transaction count (Fast Count)
        const transactionCount = await transactionRepository.getCountForAccount(accountId, cutoffDate);

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
