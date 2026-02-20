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

    observeEnrichedForAccount(accountId: string, limit: number, dateRange?: { startDate: number, endDate: number }) {
        if (!accountId) return of([] as EnrichedTransaction[]);

        const account$ = accountRepository.observeById(accountId);

        // React to hierarchy changes by rebuilding the descendant set from observed accounts.
        const descendantIds$ = accountRepository.observeAll().pipe(
            map(accounts => this.getAccountTreeIds(accountId, accounts)),
            distinctUntilChanged((a, b) => a.length === b.length && a.every((id, idx) => id === b[idx]))
        );

        // 2. Observe transactions for all these accounts
        const transactions$ = descendantIds$.pipe(
            switchMap(ids => transactionRepository.observeByAccounts(ids, limit, dateRange))
        );

        const journalIds$ = transactions$.pipe(
            map((transactions) => Array.from(new Set(transactions.map(t => t.journalId))).sort()),
            distinctUntilChanged((a, b) => a.length === b.length && a.every((id, idx) => id === b[idx]))
        );

        const journals$ = journalIds$.pipe(
            switchMap((journalIds) => journalRepository.observeByIds(journalIds))
        );

        // 3. To handle account names/icons for each transaction correctly (since they might be from children)
        // we need all accounts involved in these transactions
        const allAccountIds$ = transactions$.pipe(
            map(txs => Array.from(new Set(txs.map(t => t.accountId))).sort()),
            distinctUntilChanged((a, b) => a.length === b.length && a.every((id, idx) => id === b[idx]))
        );

        const allAccounts$ = allAccountIds$.pipe(
            switchMap(ids => accountRepository.observeByIds(ids))
        );

        return combineLatest([transactions$, account$, journals$, allAccounts$]).pipe(
            map(([transactions, parentAccount, journals, allAccounts]) => {
                const journalMap = new Map(journals.map(j => [j.id, j]));
                const accountMap = new Map(allAccounts.map(a => [a.id, a]));

                return transactions.map(tx => {
                    const journal = journalMap.get(tx.journalId);
                    const txAccount = accountMap.get(tx.accountId);

                    // Balance impact is calculated relative to the PARENT account's type
                    // since we are viewing the parent's ledger
                    const isIncrease = isBalanceIncrease(parentAccount?.accountType as any, tx.transactionType as any);

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
                        accountName: txAccount?.name || parentAccount?.name,
                        accountType: txAccount?.accountType as any || parentAccount?.accountType as any,
                        icon: txAccount?.icon || parentAccount?.icon,
                        runningBalance: tx.accountId === accountId ? tx.runningBalance : undefined, // Running balance only makes sense for the specific account
                        displayTitle: journal?.description || 'Transaction',
                        displayType: journal?.displayType as any,
                        isIncrease,
                        exchangeRate: tx.exchangeRate
                    } as EnrichedTransaction;
                });
            })
        );
    }

    private getAccountTreeIds(rootAccountId: string, accounts: { id: string; parentAccountId?: string | null }[]): string[] {
        const childrenByParent = new Map<string, string[]>();
        for (const account of accounts) {
            if (!account.parentAccountId) continue;
            const siblings = childrenByParent.get(account.parentAccountId) || [];
            siblings.push(account.id);
            childrenByParent.set(account.parentAccountId, siblings);
        }

        const result: string[] = [];
        const queue: string[] = [rootAccountId];

        while (queue.length > 0) {
            const current = queue.shift();
            if (!current) continue;
            result.push(current);
            const children = childrenByParent.get(current) || [];
            queue.push(...children);
        }

        return result;
    }

    async getEnrichedTransactionsForAccount(accountId: string, limit: number, dateRange?: { startDate: number, endDate: number }): Promise<EnrichedTransaction[]> {
        const descendantIds = await accountRepository.getDescendantIds(accountId);
        const allAccountIds = [accountId, ...descendantIds];

        const transactions = await transactionRepository.findTransactionsByAccounts(allAccountIds, limit, dateRange);
        if (transactions.length === 0) return [];

        const journalIds = Array.from(new Set(transactions.map((t: any) => t.journalId)));
        const allJournals = await journalRepository.findByIds(journalIds);
        const journalMap = new Map<string, any>(allJournals.map((j: any) => [j.id, j]));

        const allAccounts = await accountRepository.findAllByIds(allAccountIds);
        const accountMap = new Map(allAccounts.map(a => [a.id, a]));

        const parentAccount = accountMap.get(accountId);

        return transactions.map((tx: any) => {
            const journal = journalMap.get(tx.journalId);
            const txAccount = accountMap.get(tx.accountId);
            const isIncrease = isBalanceIncrease(parentAccount?.accountType as any, tx.transactionType as any);

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
                accountName: txAccount?.name || parentAccount?.name,
                accountType: txAccount?.accountType as any || parentAccount?.accountType as any,
                icon: txAccount?.icon || parentAccount?.icon,
                runningBalance: tx.accountId === accountId ? tx.runningBalance : undefined,
                displayTitle: journal?.description || 'Transaction',
                displayType: journal?.displayType as any,
                isIncrease,
                exchangeRate: tx.exchangeRate
            } as EnrichedTransaction;
        });
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
