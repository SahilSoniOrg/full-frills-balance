import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { AccountType, TransactionWithAccountInfo } from '@/src/types/domain';
import { isBalanceIncrease, isValueEntering } from '@/src/utils/accounting-utils';
import { from, switchMap } from 'rxjs';

export class TransactionService {
    /**
     * Gets transactions for a journal with account information.
     * Replaces TransactionRepository.findByJournalWithAccountInfo
     */
    async getTransactionsWithAccountInfo(journalId: string): Promise<TransactionWithAccountInfo[]> {
        const transactions = await transactionRepository.findByJournal(journalId);

        const accountIds = [...new Set(transactions.map(tx => tx.accountId))];
        const accounts = await accountRepository.findAllByIds(accountIds);

        const accountMap = new Map(
            accounts.filter(Boolean).map(acc => [acc.id, acc])
        );

        return transactions.map(tx => {
            const account = accountMap.get(tx.accountId);
            const flowDirection = isValueEntering(tx.transactionType as any) ? 'IN' : 'OUT';
            const balanceImpact = isBalanceIncrease(account?.accountType as any, tx.transactionType as any) ? 'INCREASE' : 'DECREASE';

            return {
                id: tx.id,
                amount: tx.amount,
                transactionType: tx.transactionType,
                currencyCode: tx.currencyCode,
                transactionDate: tx.transactionDate,
                notes: tx.notes,
                accountId: tx.accountId,
                exchangeRate: tx.exchangeRate,
                accountName: account?.name || 'Unknown Account',
                accountType: account?.accountType as AccountType,
                flowDirection,
                balanceImpact,
                createdAt: tx.createdAt,
                updatedAt: tx.updatedAt,
            } as TransactionWithAccountInfo;
        });
    }

    /**
     * Reactive version of getTransactionsWithAccountInfo.
     * Replaces TransactionRepository.observeByJournalWithAccountInfo
     */
    observeTransactionsWithAccountInfo(journalId: string) {
        return transactionRepository.observeByJournal(journalId)
            .pipe(
                switchMap(transactions => {
                    return from((async () => {
                        const accountIds = [...new Set(transactions.map(t => t.accountId))];
                        const accounts = await accountRepository.findAllByIds(accountIds);
                        const accountMap = new Map(accounts.map(a => [a.id, a]));

                        return transactions.map(tx => {
                            const account = accountMap.get(tx.accountId);
                            return {
                                id: tx.id,
                                amount: tx.amount,
                                transactionType: tx.transactionType,
                                currencyCode: tx.currencyCode,
                                transactionDate: tx.transactionDate,
                                notes: tx.notes,
                                accountId: tx.accountId,
                                exchangeRate: tx.exchangeRate,
                                accountName: account?.name || 'Unknown Account',
                                accountType: account?.accountType as AccountType,
                                flowDirection: isValueEntering(tx.transactionType as any) ? 'IN' : 'OUT',
                                balanceImpact: isBalanceIncrease(account?.accountType as any, tx.transactionType as any) ? 'INCREASE' : 'DECREASE',
                                createdAt: tx.createdAt,
                                updatedAt: tx.updatedAt,
                            } as TransactionWithAccountInfo;
                        });
                    })());
                })
            );
    }
}

export const transactionService = new TransactionService();
