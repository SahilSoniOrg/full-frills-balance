import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { EnrichedTransaction, TransactionWithAccountInfo } from '@/src/types/domain';
import { isBalanceIncrease, isValueEntering } from '@/src/utils/accounting-utils';
import { combineLatest, map, of, switchMap } from 'rxjs';

export class TransactionService {
    /**
     * Gets transactions for a journal with account information.
     */
    async getTransactionsWithAccountInfo(journalId: string): Promise<TransactionWithAccountInfo[]> {
        const journal = await journalRepository.find(journalId);
        const transactions = await transactionRepository.findByJournal(journalId);

        const accountIds = Array.from(new Set(transactions.map(t => t.accountId)));
        const accounts = await accountRepository.findAllByIds(accountIds);
        const accountMap = new Map(accounts.map(a => [a.id, a]));

        return transactions.map(tx => {
            const account = accountMap.get(tx.accountId);
            return {
                id: tx.id,
                amount: tx.amount,
                transactionType: tx.transactionType as any,
                currencyCode: tx.currencyCode,
                transactionDate: tx.transactionDate,
                notes: tx.notes,
                accountId: tx.accountId,
                exchangeRate: tx.exchangeRate,
                accountName: account?.name || 'Unknown Account',
                accountType: account?.accountType as any,
                flowDirection: isValueEntering(tx.transactionType as any) ? 'IN' : 'OUT',
                balanceImpact: isBalanceIncrease(account?.accountType as any, tx.transactionType as any) ? 'INCREASE' : 'DECREASE',
                createdAt: tx.createdAt,
                updatedAt: tx.updatedAt,
                journalDescription: journal?.description
            } as TransactionWithAccountInfo;
        });
    }

    /**
     * Gets enriched transactions for a journal.
     */
    async getEnrichedByJournal(journalId: string): Promise<EnrichedTransaction[]> {
        const journal = await journalRepository.find(journalId);
        const transactions = await transactionRepository.findByJournal(journalId);

        const accountIds = Array.from(new Set(transactions.map(t => t.accountId)));
        const accounts = await accountRepository.findAllByIds(accountIds);
        const accountMap = new Map(accounts.map(a => [a.id, a]));

        return transactions.map(tx => {
            const account = accountMap.get(tx.accountId);
            return {
                id: tx.id,
                journalId: tx.journalId,
                accountId: tx.accountId,
                amount: tx.amount,
                currencyCode: tx.currencyCode,
                transactionType: tx.transactionType as any,
                transactionDate: tx.transactionDate,
                notes: tx.notes,
                journalDescription: journal?.description,
                accountName: account?.name,
                accountType: account?.accountType as any,
                runningBalance: tx.runningBalance,
                displayTitle: journal?.description || 'Transaction',
                displayType: journal?.displayType as any,
                isIncrease: ['ASSET', 'EXPENSE'].includes(account?.accountType || '')
                    ? tx.transactionType === 'DEBIT'
                    : tx.transactionType === 'CREDIT',
                exchangeRate: tx.exchangeRate
            } as EnrichedTransaction;
        });
    }

    /**
     * Reactive version of getTransactionsWithAccountInfo.
     * Replaces TransactionRepository.observeByJournalWithAccountInfo
     */
    observeTransactionsWithAccountInfo(journalId: string) {
        if (!journalId) return of([] as TransactionWithAccountInfo[]);

        const journal$ = journalRepository.observeById(journalId);
        const transactions$ = transactionRepository.observeByJournal(journalId);

        return combineLatest([transactions$, journal$]).pipe(
            switchMap(([transactions, journal]) => {
                const accountIds = Array.from(new Set(transactions.map(t => t.accountId)));
                return accountRepository.observeByIds(accountIds).pipe(
                    map((accounts) => {
                        const accountMap = new Map(accounts.map(a => [a.id, a]));
                        return transactions.map(tx => {
                            const account = accountMap.get(tx.accountId);
                            return {
                                id: tx.id,
                                amount: tx.amount,
                                transactionType: tx.transactionType as any,
                                currencyCode: tx.currencyCode,
                                transactionDate: tx.transactionDate,
                                notes: tx.notes,
                                accountId: tx.accountId,
                                exchangeRate: tx.exchangeRate,
                                accountName: account?.name || 'Unknown Account',
                                accountType: account?.accountType as any,
                                flowDirection: isValueEntering(tx.transactionType as any) ? 'IN' : 'OUT',
                                balanceImpact: isBalanceIncrease(account?.accountType as any, tx.transactionType as any) ? 'INCREASE' : 'DECREASE',
                                createdAt: tx.createdAt,
                                updatedAt: tx.updatedAt,
                                journalDescription: journal?.description
                            } as TransactionWithAccountInfo;
                        });
                    })
                );
            })
        );
    }

    observeEnrichedByJournal(journalId: string) {
        if (!journalId) return of([] as EnrichedTransaction[]);

        const journal$ = journalRepository.observeById(journalId);
        const transactions$ = transactionRepository.observeByJournal(journalId);

        return combineLatest([transactions$, journal$]).pipe(
            switchMap(([transactions, journal]) => {
                const accountIds = Array.from(new Set(transactions.map(t => t.accountId)));
                return accountRepository.observeByIds(accountIds).pipe(
                    map((accounts) => {
                        const accountMap = new Map(accounts.map(a => [a.id, a]));
                        return transactions.map(tx => {
                            const account = accountMap.get(tx.accountId);
                            return {
                                id: tx.id,
                                journalId: tx.journalId,
                                accountId: tx.accountId,
                                amount: tx.amount,
                                currencyCode: tx.currencyCode,
                                transactionType: tx.transactionType as any,
                                transactionDate: tx.transactionDate,
                                notes: tx.notes,
                                journalDescription: journal?.description,
                                accountName: account?.name,
                                accountType: account?.accountType as any,
                                runningBalance: tx.runningBalance,
                                displayTitle: journal?.description || 'Transaction',
                                displayType: journal?.displayType as any,
                                isIncrease: ['ASSET', 'EXPENSE'].includes(account?.accountType || '')
                                    ? tx.transactionType === 'DEBIT'
                                    : tx.transactionType === 'CREDIT',
                                exchangeRate: tx.exchangeRate
                            } as EnrichedTransaction;
                        });
                    })
                );
            })
        );
    }

    observeEnrichedForAccount(accountId: string, limit: number, dateRange?: { startDate: number, endDate: number }) {
        if (!accountId) return of([] as EnrichedTransaction[]);

        const transactions$ = journalRepository.observeAccountTransactions(accountId, limit, dateRange);
        const account$ = accountRepository.observeById(accountId);

        return combineLatest([transactions$, account$]).pipe(
            switchMap(([transactions, account]) => {
                const journalIds = Array.from(new Set(transactions.map(t => t.journalId)));
                return journalRepository.observeByIds(journalIds).pipe(
                    map((journals) => {
                        const journalMap = new Map(journals.map(j => [j.id, j]));
                        return transactions.map(tx => {
                            const journal = journalMap.get(tx.journalId);
                            return {
                                id: tx.id,
                                journalId: tx.journalId,
                                accountId: tx.accountId,
                                amount: tx.amount,
                                currencyCode: tx.currencyCode,
                                transactionType: tx.transactionType as any,
                                transactionDate: tx.transactionDate,
                                notes: tx.notes,
                                journalDescription: journal?.description,
                                accountName: account?.name,
                                accountType: account?.accountType as any,
                                runningBalance: tx.runningBalance,
                                displayTitle: journal?.description || 'Transaction',
                                displayType: journal?.displayType as any,
                                isIncrease: ['ASSET', 'EXPENSE'].includes(account?.accountType || '')
                                    ? tx.transactionType === 'DEBIT'
                                    : tx.transactionType === 'CREDIT',
                                exchangeRate: tx.exchangeRate
                            } as EnrichedTransaction;
                        });
                    })
                );
            })
        );
    }

    async getEnrichedTransactionsForAccount(accountId: string, limit: number, dateRange?: { startDate: number, endDate: number }): Promise<EnrichedTransaction[]> {
        const transactions = await transactionRepository.findByAccount(accountId, limit, dateRange);
        if (transactions.length === 0) return [];

        const journalIds = Array.from(new Set(transactions.map((t: any) => t.journalId)));
        const allJournals = await journalRepository.findByIds(journalIds);
        const journalMap = new Map<string, any>(allJournals.map((j: any) => [j.id, j]));

        const accounts = await accountRepository.findAllByIds([accountId]);
        const account = accounts[0];

        return transactions.map((tx: any) => {
            const journal = journalMap.get(tx.journalId);

            return {
                id: tx.id,
                journalId: tx.journalId,
                accountId: tx.accountId,
                amount: tx.amount,
                currencyCode: tx.currencyCode,
                transactionType: tx.transactionType as any,
                transactionDate: tx.transactionDate,
                notes: tx.notes,
                journalDescription: journal?.description,
                accountName: account?.name,
                accountType: account?.accountType as any,
                runningBalance: tx.runningBalance,
                displayTitle: journal?.description || 'Transaction',
                displayType: journal?.displayType as any,
                isIncrease: isBalanceIncrease(account?.accountType as any, tx.transactionType as any),
                exchangeRate: tx.exchangeRate
            } as EnrichedTransaction;
        });
    }
}

export const transactionService = new TransactionService();
