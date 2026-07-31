import Account, { AccountType } from '@/src/data/models/Account';
import Journal from '@/src/data/models/Journal';
import Transaction from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import {
  journalObserveQueries,
  journalQueryRepository,
} from '@/src/data/repositories/journal/journalTimelineModule';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import {
  AccountId,
  DisplayCounterAccount,
  DisplayTransaction,
  JournalId,
  WorkplaceId,
} from '@/src/types/domain';
import { effect } from '@/src/services/accounting/BalanceEffects';
import { combineLatest, distinctUntilChanged, map, of, switchMap } from 'rxjs';

export class TransactionService {
  /**
   * Gets transactions for a journal with account information.
   */
  async getTransactionsWithAccountInfo(
    workplaceId: WorkplaceId,
    journalId: JournalId,
  ): Promise<DisplayTransaction[]> {
    const journal = await journalQueryRepository.find(workplaceId, journalId);
    const transactions = await transactionRepository.findByJournal(workplaceId, journalId);

    const accountIds = Array.from(new Set(transactions.map(t => t.accountId)));
    const accounts = await accountRepository.findAllByIds(workplaceId, accountIds);
    const accountMap = new Map(accounts.map(a => [a.id, a]));

    return transactions.map(tx => {
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
  }

  /**
   * Gets enriched transactions for a journal.
   */
  async getEnrichedByJournal(
    workplaceId: WorkplaceId,
    journalId: JournalId,
  ): Promise<DisplayTransaction[]> {
    const journal = await journalQueryRepository.find(workplaceId, journalId);
    const transactions = await transactionRepository.findByJournal(workplaceId, journalId);

    const accountIds = Array.from(new Set(transactions.map(t => t.accountId)));
    const accounts = await accountRepository.findAllByIds(workplaceId, accountIds);
    const accountMap = new Map(accounts.map(a => [a.id, a]));

    return transactions.map(tx => this.mapToEnriched(tx, transactions, accountMap, journal));
  }

  /**
   * Reactive version of getTransactionsWithAccountInfo.
   */
  observeTransactionsWithAccountInfo(
    workplaceId: WorkplaceId,
    journalId: JournalId,
    includeDeleted: boolean = false,
  ) {
    if (!journalId) return of([] as DisplayTransaction[]);

    const journal$ = journalObserveQueries.observeById(workplaceId, journalId, includeDeleted);
    const transactions$ = transactionRepository.observeByJournal(
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
        return accountRepository.observeByIds(journal.workplaceId, accountIds);
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

  observeEnrichedByJournal(
    workplaceId: WorkplaceId,
    journalId: JournalId,
    includeDeleted: boolean = false,
  ) {
    if (!journalId) return of([] as DisplayTransaction[]);

    const journal$ = journalObserveQueries.observeById(workplaceId, journalId, includeDeleted);
    const transactions$ = transactionRepository.observeByJournal(
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
        return accountRepository.observeByIds(journal.workplaceId, accountIds);
      }),
    );

    return combineLatest([transactions$, journal$, accounts$]).pipe(
      map(([transactions, journal, accounts]) => {
        const accountMap = new Map(accounts.map(a => [a.id, a]));
        const isJournalDeleted = !!(journal && journal.deletedAt);
        const validTransactions = transactions.filter(tx => isJournalDeleted || !tx.deletedAt);

        return validTransactions.map(tx =>
          this.mapToEnriched(tx, validTransactions, accountMap, journal),
        );
      }),
    );
  }

  private mapToEnriched(
    tx: Transaction,
    transactions: Transaction[],
    accountMap: Map<AccountId, Account>,
    journal: Journal | null,
  ): DisplayTransaction {
    const account = accountMap.get(tx.accountId);
    const seenCounterIds = new Set<AccountId>();
    const counterAccounts: DisplayCounterAccount[] = [];
    for (const other of transactions) {
      if (other.id === tx.id) continue;
      const counter = accountMap.get(other.accountId);
      if (!counter || seenCounterIds.has(counter.id)) continue;
      seenCounterIds.add(counter.id);
      counterAccounts.push({
        id: counter.id,
        name: counter.name,
        accountType: counter.accountType,
        icon: counter.icon,
      });
    }

    const accType = account?.accountType ?? AccountType.ASSET;
    const isIncrease = effect(accType, tx.transactionType).isIncrease;

    return {
      id: tx.id,
      journalId: tx.journalId,
      accountId: tx.accountId,
      amount: tx.amount,
      currencyCode: tx.currencyCode,
      transactionType: tx.transactionType,
      transactionDate: tx.transactionDate,
      notes: tx.notes,
      journalDescription: journal?.description,
      accountName: account?.name,
      accountType: account?.accountType,
      icon: account?.icon,
      counterAccounts: counterAccounts.length > 0 ? counterAccounts : undefined,
      runningBalance: tx.runningBalance,
      displayTitle: journal?.description || 'Transaction',
      displayType: journal?.displayType,
      isIncrease,
      exchangeRate: tx.exchangeRate,
    } as DisplayTransaction;
  }

  /**
   * Prepares WatermelonDB operations to merge transactions from multiple accounts into a target account.
   */
  async prepareMergeOperations(
    workplaceId: WorkplaceId,
    sourceAccountIds: AccountId[],
    targetAccountId: AccountId,
  ): Promise<Transaction[]> {
    const transactions = await transactionRepository.findAllByAccountIds(
      workplaceId,
      sourceAccountIds,
    );
    return transactions.map((tx: Transaction) =>
      tx.prepareUpdate((r: Transaction) => {
        r.accountId = targetAccountId;
        r.runningBalance = null; // Invalidate cache
        r.updatedAt = new Date();
      }),
    );
  }
}

export const transactionService = new TransactionService();
