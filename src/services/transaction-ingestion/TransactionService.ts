import Account, { AccountType } from '@/src/data/models/Account';
import Journal from '@/src/data/models/Journal';
import Transaction from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { AccountId, DisplayTransaction, JournalId, WorkplaceId } from '@/src/types/domain';
import { isBalanceIncrease, isValueEntering } from '@/src/utils/accountingHelpers';
import { combineLatest, distinctUntilChanged, map, of, switchMap } from 'rxjs';

export class TransactionService {
  /**
   * Gets transactions for a journal with account information.
   */
  async getTransactionsWithAccountInfo(
    workplaceId: WorkplaceId,
    journalId: JournalId,
  ): Promise<DisplayTransaction[]> {
    const journal = await journalRepository.find(workplaceId, journalId);
    const transactions = await transactionRepository.findByJournal(workplaceId, journalId);

    const accountIds = Array.from(new Set(transactions.map(t => t.accountId)));
    const accounts = await accountRepository.findAllByIds(workplaceId, accountIds);
    const accountMap = new Map(accounts.map(a => [a.id, a]));

    return transactions.map(tx => {
      const account = accountMap.get(tx.accountId);
      const accType = account?.accountType ?? AccountType.ASSET;
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
        flowDirection: isValueEntering(tx.transactionType) ? 'IN' : 'OUT',
        balanceImpact: isBalanceIncrease(accType, tx.transactionType) ? 'INCREASE' : 'DECREASE',
        createdAt: tx.createdAt,
        updatedAt: tx.updatedAt,
        journalDescription: journal?.description,
        displayTitle: journal?.description || 'Transaction',
        isIncrease: isBalanceIncrease(accType, tx.transactionType),
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
    const journal = await journalRepository.find(workplaceId, journalId);
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

    const journal$ = journalRepository.observeById(workplaceId, journalId, includeDeleted);
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
        if (!journal) return of([] as any[]);
        return accountRepository.observeByIds(journal.workplaceId, accountIds);
      }),
    );

    return combineLatest([transactions$, journal$, accounts$]).pipe(
      map(([transactions, journal, accounts]) => {
        const accountMap = new Map(accounts.map(a => [a.id, a as any]));
        const isJournalDeleted = !!(journal && journal.deletedAt);
        const validTransactions = transactions.filter(tx => isJournalDeleted || !tx.deletedAt);

        return validTransactions.map(tx => {
          const account = accountMap.get(tx.accountId);
          const accType = account?.accountType ?? AccountType.ASSET;
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
            flowDirection: isValueEntering(tx.transactionType) ? 'IN' : 'OUT',
            balanceImpact: isBalanceIncrease(accType, tx.transactionType) ? 'INCREASE' : 'DECREASE',
            createdAt: tx.createdAt,
            updatedAt: tx.updatedAt,
            journalDescription: journal?.description,
            displayTitle: journal?.description || 'Transaction',
            isIncrease: isBalanceIncrease(accType, tx.transactionType),
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

    const journal$ = journalRepository.observeById(workplaceId, journalId, includeDeleted);
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
        if (!journal) return of([] as any[]);
        return accountRepository.observeByIds(journal.workplaceId, accountIds);
      }),
    );

    return combineLatest([transactions$, journal$, accounts$]).pipe(
      map(([transactions, journal, accounts]) => {
        const accountMap = new Map(accounts.map(a => [a.id, a as any]));
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
    const counterAccounts = transactions
      .filter(t => t.id !== tx.id)
      .map(t => accountMap.get(t.accountId))
      .filter((a): a is Account => !!a);
    const counterAccount = counterAccounts.length === 1 ? counterAccounts[0] : undefined;

    const accType = account?.accountType ?? AccountType.ASSET;
    const isIncrease = isBalanceIncrease(accType, tx.transactionType);

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
      counterAccountName: counterAccount?.name,
      counterAccountType: counterAccount?.accountType,
      counterAccountIcon: counterAccount?.icon,
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
