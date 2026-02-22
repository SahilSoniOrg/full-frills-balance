import { AppConfig } from '@/src/constants';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { EnrichedTransaction } from '@/src/types/domain';
import { isBalanceIncrease } from '@/src/utils/accountingHelpers';
import { combineLatest, distinctUntilChanged, map, of, switchMap } from 'rxjs';

export class LedgerReadService {
    observeEnrichedForAccount(accountId: string, limit: number, dateRange?: { startDate: number; endDate: number }) {
        if (!accountId) return of([] as EnrichedTransaction[]);

        const account$ = accountRepository.observeById(accountId);

        const descendantIds$ = accountRepository.observeAll().pipe(
            map((accounts) => this.getAccountTreeIds(accountId, accounts)),
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

        const allAccountIds$ = transactions$.pipe(
            map((txs) => Array.from(new Set(txs.map((t) => t.accountId))).sort()),
            distinctUntilChanged((a, b) => a.length === b.length && a.every((id, idx) => id === b[idx])),
        );

        const allAccounts$ = allAccountIds$.pipe(
            switchMap((ids) => accountRepository.observeByIds(ids)),
        );

        return combineLatest([transactions$, account$, journals$, allAccounts$]).pipe(
            map(([transactions, parentAccount, journals, allAccounts]) => {
                const journalMap = new Map(journals.map((j) => [j.id, j]));
                const accountMap = new Map(allAccounts.map((a) => [a.id, a]));

                return transactions.map((tx) => {
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
                        displayTitle: journal?.description || AppConfig.strings.journal.transaction,
                        displayType: journal?.displayType as any,
                        isIncrease,
                        exchangeRate: tx.exchangeRate,
                    } as EnrichedTransaction;
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

        while (queue.length > 0) {
            const current = queue.shift();
            if (!current) continue;
            result.push(current);
            const children = childrenByParent.get(current) || [];
            queue.push(...children);
        }

        return result;
    }
}

export const ledgerReadService = new LedgerReadService();
