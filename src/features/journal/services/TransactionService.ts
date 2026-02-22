import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { EnrichedTransaction, TransactionWithAccountInfo } from '@/src/types/domain';
import { isBalanceIncrease, isValueEntering } from '@/src/utils/accountingHelpers';
import { combineLatest, distinctUntilChanged, map, of, switchMap } from 'rxjs';

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

        return transactions.map(tx => this.mapToEnriched(tx, transactions, accountMap, journal));
    }

    /**
     * Reactive version of getTransactionsWithAccountInfo.
     * Replaces TransactionRepository.observeByJournalWithAccountInfo
     */
    observeTransactionsWithAccountInfo(journalId: string) {
        if (!journalId) return of([] as TransactionWithAccountInfo[]);

        const journal$ = journalRepository.observeById(journalId);
        const transactions$ = transactionRepository.observeByJournal(journalId);

        const accountIds$ = transactions$.pipe(
            map((transactions) => Array.from(new Set(transactions.map(t => t.accountId))).sort()),
            distinctUntilChanged((a, b) => a.length === b.length && a.every((id, idx) => id === b[idx]))
        );

        const accounts$ = accountIds$.pipe(
            switchMap((accountIds) => accountRepository.observeByIds(accountIds))
        );

        return combineLatest([transactions$, journal$, accounts$]).pipe(
            map(([transactions, journal, accounts]) => {
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
    }

    observeEnrichedByJournal(journalId: string) {
        if (!journalId) return of([] as EnrichedTransaction[]);

        const journal$ = journalRepository.observeById(journalId);
        const transactions$ = transactionRepository.observeByJournal(journalId);

        const accountIds$ = transactions$.pipe(
            map((transactions) => Array.from(new Set(transactions.map(t => t.accountId))).sort()),
            distinctUntilChanged((a, b) => a.length === b.length && a.every((id, idx) => id === b[idx]))
        );

        const accounts$ = accountIds$.pipe(
            switchMap((accountIds) => accountRepository.observeByIds(accountIds))
        );

        return combineLatest([transactions$, journal$, accounts$]).pipe(
            map(([transactions, journal, accounts]) => {
                const accountMap = new Map(accounts.map(a => [a.id, a]));
                return transactions.map(tx => this.mapToEnriched(tx, transactions, accountMap, journal));
            })
        );
    }

    private mapToEnriched(tx: any, transactions: any[], accountMap: Map<string, any>, journal: any): EnrichedTransaction {
        const account = accountMap.get(tx.accountId);
        const counterAccounts = transactions
            .filter(t => t.id !== tx.id)
            .map(t => accountMap.get(t.accountId))
            .filter(Boolean);
        const counterAccount = counterAccounts.length === 1 ? counterAccounts[0] : undefined;
        const isIncrease = isBalanceIncrease(account?.accountType as any, tx.transactionType as any);

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
            icon: account?.icon,
            counterAccountName: counterAccount?.name,
            counterAccountType: counterAccount?.accountType as any,
            counterAccountIcon: counterAccount?.icon,
            runningBalance: tx.runningBalance,
            displayTitle: journal?.description || 'Transaction',
            displayType: journal?.displayType as any,
            isIncrease,
            exchangeRate: tx.exchangeRate
        } as EnrichedTransaction;
    }
}

export const transactionService = new TransactionService();
