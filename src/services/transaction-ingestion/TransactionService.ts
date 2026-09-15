import Account from '@/src/data/models/Account';
import { accountObserveQueries } from '@/src/data/repositories/account';
import { AccountType } from '@/src/types/enums';
import { JournalId, WorkplaceId } from '@/src/types/ids';
import { DisplayTransaction } from '@/src/types/domainReadModels';
import { journalObserveQueries } from '@/src/data/repositories/journal/journalTimelineModule';
import { transactionObserveQueries } from '@/src/data/repositories/transaction';
import { effect } from '@/src/utils/accounting/BalanceEffects';
import { combineLatest, distinctUntilChanged, map, of, switchMap } from 'rxjs';

export class TransactionService {
  /**
   * Observe transactions with their account information.
   */
  observeTransactionsWithAccountInfo(
    workplaceId: WorkplaceId,
    journalId: JournalId,
    includeDeleted: boolean = false,
  ) {
    if (!journalId) return of([] as DisplayTransaction[]);

    const journal$ = journalObserveQueries.observeById(workplaceId, journalId, includeDeleted);
    const transactions$ = transactionObserveQueries.observeByJournal(
      workplaceId,
      journalId,
      includeDeleted,
    );

    const accountIds$ = transactions$.pipe(
      map(transactions => Array.from(new Set(transactions.map(t => t.accountId))).sort()),
      distinctUntilChanged((a, b) => a.length === b.length && a.every((id, idx) => id === b[idx])),
    );

    const accounts$ = combineLatest([accountIds$, journal$]).pipe(
      switchMap(([accountIds, journal]) => {
        if (!journal) return of([] as Account[]);
        return accountObserveQueries.observeByIds(journal.workplaceId, accountIds);
      }),
    );

    return combineLatest([transactions$, journal$, accounts$]).pipe(
      map(([transactions, journal, accounts]) => {
        const accountMap = new Map(accounts.map(a => [a.id, a]));
        const isJournalDeleted = !!(journal && journal.deletedAt);
        const validTransactions = transactions.filter(tx => isJournalDeleted || !tx.deletedAt);

        return validTransactions.map(tx => {
          const account = accountMap.get(tx.accountId);
          const accType = account?.accountType ?? AccountType.ASSET;
          const bal = effect(accType, tx.transactionType);
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
            accountType: account?.accountType,
            flowDirection: bal.flow,
            balanceImpact: bal.isIncrease ? 'INCREASE' : 'DECREASE',
            createdAt: tx.createdAt,
            updatedAt: tx.updatedAt,
            journalDescription: journal?.description,
            displayTitle: journal?.description || 'Transaction',
            isIncrease: bal.isIncrease,
          } as DisplayTransaction;
        });
      }),
    );
  }
}

export const transactionService = new TransactionService();
