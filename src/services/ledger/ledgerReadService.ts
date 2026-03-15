import { AppConfig } from '@/src/constants';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { DisplayTransaction } from '@/src/types/domain';
import { isBalanceIncrease } from '@/src/utils/accountingHelpers';
import { auditTime, combineLatest, distinctUntilChanged, map, of, switchMap } from 'rxjs';

export class LedgerReadService {
    observeEnrichedForAccount(accountId: string, limit: number, dateRange?: { startDate: number; endDate: number }) {
        if (!accountId) return of([] as DisplayTransaction[]);

        return this.observeEnrichedForAccounts([accountId], limit, dateRange);
    }

    observeEnrichedForAccounts(rootAccountIds: string[], limit: number, dateRange?: { startDate: number; endDate: number }) {
        if (!rootAccountIds || rootAccountIds.length === 0) return of([] as DisplayTransaction[]);

        const descendantIds$ = accountRepository.observeAll().pipe(
            map((accounts) => {
                const allIds = new Set<string>();
                for (const rootId of rootAccountIds) {
                    const ids = this.getAccountTreeIds(rootId, accounts);
                    ids.forEach(id => allIds.add(id));
                }
                return Array.from(allIds);
            }),
            distinctUntilChanged((a, b) => a.length === b.length && a.every((id, idx) => id === b[idx])),
        );

        const transactions$ = descendantIds$.pipe(
            switchMap((ids) => transactionRepository.observeByAccounts(ids, limit, dateRange)),
        );

        const journalIds$ = transactions$.pipe(
            map((transactions) => Array.from(new Set(transactions.map((t) => t.journalId))).sort()),
            distinctUntilChanged((a, b) => a.length === b.length && a.every((id, idx) => id === b[idx])),
        );

        const journals$ = journalIds$.pipe(
            switchMap((journalIds) => journalRepository.observeByIds(journalIds)),
        );

        const allJournalTransactions$ = journalIds$.pipe(
            switchMap((ids) => transactionRepository.observeByJournals(ids)),
        );

        const allAccountIds$ = allJournalTransactions$.pipe(
            map((txs: any[]) => Array.from(new Set(txs.map((t) => t.accountId as string))).sort()),
            distinctUntilChanged((a, b) => a.length === b.length && a.every((id, idx) => id === b[idx])),
            auditTime(50),
        );

        const allAccounts$ = allAccountIds$.pipe(
            switchMap((ids: string[]) => accountRepository.observeByIds(ids)),
        );

        return combineLatest([transactions$, journals$, allAccounts$, allJournalTransactions$]).pipe(
            auditTime(25), // Batch rapid data emissions
            map(([transactions, journals, allAccounts, allJournalTransactions]) => {
                const journalMap = new Map(journals.map((j) => [j.id, j]));
                const accountMap = new Map(allAccounts.map((a) => [a.id, a]));
                
                // Pre-group all journal transactions for O(1) lookup in the main loop
                const transactionsByJournal = new Map<string, any[]>();
                for (const tx of allJournalTransactions as any[]) {
                    if (!transactionsByJournal.has(tx.journalId)) {
                        transactionsByJournal.set(tx.journalId, []);
                    }
                    transactionsByJournal.get(tx.journalId)!.push(tx);
                }

                return transactions.map((tx) => {
                    const journal = journalMap.get(tx.journalId);
                    const txAccount = accountMap.get(tx.accountId);
                    const isIncrease = isBalanceIncrease(txAccount?.accountType as any, tx.transactionType as any);

                    // Optimized counter-party lookup
                    const journalTransactions = transactionsByJournal.get(tx.journalId) || [];
                    const counterPartyTransactions = journalTransactions.filter((jtx: any) => jtx.transactionType !== tx.transactionType);

                    const counterAccounts = counterPartyTransactions.map((ctx: any) => {
                        const acc = accountMap.get(ctx.accountId);
                        return {
                            id: ctx.accountId,
                            name: acc?.name || 'Unknown',
                            accountType: acc?.accountType as any,
                            icon: acc?.icon || null,
                        };
                    });

                    const firstCounter = counterAccounts[0];

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
                        accountName: txAccount?.name,
                        accountType: txAccount?.accountType as any,
                        icon: txAccount?.icon,
                        runningBalance: rootAccountIds.length === 1 && rootAccountIds.includes(tx.accountId) ? tx.runningBalance : undefined,
                        displayTitle: journal?.description || AppConfig.strings.journal.transaction,
                        displayType: journal?.displayType as any,
                        isIncrease,
                        exchangeRate: tx.exchangeRate,
                        counterAccountName: firstCounter?.name,
                        counterAccountType: firstCounter?.accountType,
                        counterAccountIcon: firstCounter?.icon,
                        counterAccounts,
                    } as DisplayTransaction;
                });
            }),
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
        let i = 0;

        while (i < queue.length) {
            const current = queue[i++];
            if (!current) continue;
            result.push(current);
            const children = childrenByParent.get(current) || [];
            queue.push(...children);
        }

        return result;
    }
}

export const ledgerReadService = new LedgerReadService();
