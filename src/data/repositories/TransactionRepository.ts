import { AppConfig } from '@/src/constants/app-config';
import { database } from '@/src/data/database/Database';
import Transaction from '@/src/data/models/Transaction';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';
import { logger } from '@/src/utils/logger';
import { roundToPrecision } from '@/src/utils/money';
import { Q } from '@nozbe/watermelondb';
import { of } from 'rxjs';

export class TransactionRepository {
  private get transactions() {
    return database.collections.get<Transaction>('transactions');
  }

  transactionsQuery(...clauses: any[]) {
    return this.transactions.query(...clauses);
  }

  /**
   * Centralized logic for defining what constitutes an "Active" (valid/non-deleted) transaction.
   * Prevents logic divergence across the repository.
   */
  private buildActiveClauses(extraClauses: any[] = []): any[] {
    return [
      Q.experimentalJoinTables(['journals']),
      Q.where('deleted_at', Q.eq(null)),
      Q.on('journals', [
        Q.where('status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
        Q.where('deleted_at', Q.eq(null)),
      ]),
      ...extraClauses,
    ];
  }

  private deterministicSort(query: any, qSort: any = Q.desc) {
    return query.extend(
      Q.sortBy('transaction_date', qSort),
      Q.sortBy('created_at', qSort),
      Q.sortBy('id', qSort),
    );
  }

  /**
   * Creates a new transaction
   * @param transactionData Transaction data to create
   * @param enforcePositiveAmount If true, will throw if amount is not positive
   * @returns The created transaction
   * @throws {Error} If amount is not positive and enforcePositiveAmount is true
   */
  async create(
    transactionData: Omit<
      Partial<Transaction>,
      'id' | 'createdAt' | 'updatedAt' | 'running_balance'
    >,
    precision: number = 2,
    enforcePositiveAmount = true,
  ): Promise<Transaction> {
    // Enforce positive amount invariant
    if (
      enforcePositiveAmount &&
      transactionData.amount !== undefined &&
      transactionData.amount <= 0
    ) {
      throw new Error(
        'Transaction amount must be positive. Sign is determined by transactionType.',
      );
    }

    if (!transactionData.transactionType) {
      throw new Error('transactionType is required for transaction creation');
    }

    const accountId = transactionData.accountId;
    if (!accountId) throw new Error('accountId is required for transaction creation');

    return database.write(async () => {
      const created = await this.transactions.create(transaction => {
        Object.assign(transaction, {
          ...transactionData,
          // Ensure amount is positive and rounded to precision
          amount: roundToPrecision(Math.abs(transactionData.amount || 0), precision),
          // Set running_balance to null (meaning uncomputed) instead of undefined
          running_balance: null,
        });
        transaction.createdAt = new Date();
        transaction.updatedAt = new Date();
      });

      return created;
    });
  }

  /**
   * Gets transactions for a journal with account information
   * Repository-owned read model for UI consumption
   *
   * @param journalId Journal ID to fetch transactions for
   * @returns Array of transactions with account information
   */

  /**
   * Reactive version of findByJournalWithAccountInfo
   * @param journalId Journal ID to observe
   */

  /**
   * Finds a transaction by ID
   */
  async find(id: string): Promise<Transaction | null> {
    return this.transactions.find(id);
  }

  /**
   * Gets all transactions for an account
   */
  async findByAccount(
    accountId: string,
    limit?: number,
    dateRange?: { startDate: number; endDate: number },
    sortOrder: 'asc' | 'desc' = 'desc',
  ): Promise<Transaction[]> {
    const qSort = sortOrder === 'asc' ? Q.asc : Q.desc;
    const clauses = this.buildActiveClauses([Q.where('account_id', accountId)]);

    if (dateRange) {
      clauses.push(Q.where('transaction_date', Q.gte(dateRange.startDate)));
      clauses.push(Q.where('transaction_date', Q.lte(dateRange.endDate)));
    }

    let query = this.deterministicSort(this.transactions.query(...clauses), qSort);

    if (limit) {
      query = query.extend(Q.take(limit));
    }

    const start = Date.now();
    const results = await query.fetch();

    logger.info(`[Trace] TransactionRepository.findByAccount: ${Date.now() - start}ms`, {
      accountId,
      count: results.length,
    });

    return results;
  }

  observeByAccounts(
    accountIds: string[],
    limit: number = AppConfig.pagination.dashboardPageSize,
    dateRange?: { startDate: number; endDate: number },
  ): import('rxjs').Observable<Transaction[]> {
    const clauses = this.buildActiveClauses([Q.where('account_id', Q.oneOf(accountIds))]);

    if (dateRange) {
      clauses.push(Q.where('transaction_date', Q.gte(dateRange.startDate)));
      clauses.push(Q.where('transaction_date', Q.lte(dateRange.endDate)));
    }

    return this.deterministicSort(this.transactions.query(...clauses), Q.desc)
      .extend(Q.take(limit))
      .observeWithColumns([
        'amount',
        'currency_code',
        'transaction_type',
        'transaction_date',
        'notes',
        'running_balance',
        'exchange_rate',
        'account_id',
        'journal_id',
      ]);
  }

  async findByJournals(journalIds: string[]): Promise<Transaction[]> {
    if (journalIds.length === 0) return [];
    return this.transactions
      .query(Q.where('journal_id', Q.oneOf(journalIds)), Q.where('deleted_at', Q.eq(null)))
      .fetch();
  }

  observeByJournals(journalIds: string[]): import('rxjs').Observable<Transaction[]> {
    if (journalIds.length === 0) return of([] as Transaction[]);
    return this.transactions
      .query(Q.where('journal_id', Q.oneOf(journalIds)), Q.where('deleted_at', Q.eq(null)))
      .observeWithColumns([
        'amount',
        'currency_code',
        'transaction_type',
        'transaction_date',
        'notes',
        'running_balance',
        'exchange_rate',
        'account_id',
        'journal_id',
      ]);
  }

  observeByJournal(journalId: string, includeDeleted: boolean = false) {
    const clauses: any[] = [
      Q.experimentalJoinTables(['journals']),
      Q.where('journal_id', journalId),
    ];

    if (!includeDeleted) {
      clauses.push(Q.where('deleted_at', Q.eq(null)));
      clauses.push(
        Q.on('journals', [
          Q.where('status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES, 'PLANNED'])),
          Q.where('deleted_at', Q.eq(null)),
        ]),
      );
    }

    return this.transactions
      .query(...clauses)
      .extend(Q.sortBy('transaction_date', Q.asc))
      .extend(Q.sortBy('created_at', Q.asc))
      .observeWithColumns([
        'amount',
        'currency_code',
        'transaction_type',
        'transaction_date',
        'notes',
        'running_balance',
        'exchange_rate',
        'account_id',
        'journal_id',
      ]);
  }

  async findTransactionsByAccounts(
    accountIds: string[],
    limit: number = AppConfig.pagination.dashboardPageSize,
    dateRange?: { startDate: number; endDate: number },
  ): Promise<Transaction[]> {
    const clauses = this.buildActiveClauses([Q.where('account_id', Q.oneOf(accountIds))]);

    if (dateRange) {
      clauses.push(Q.where('transaction_date', Q.gte(dateRange.startDate)));
      clauses.push(Q.where('transaction_date', Q.lte(dateRange.endDate)));
    }

    let query = this.deterministicSort(this.transactions.query(...clauses), Q.desc);

    if (limit) {
      query = query.extend(Q.take(limit));
    }

    const start = Date.now();
    const results = await query.fetch();

    logger.info(
      `[Trace] TransactionRepository.findTransactionsByAccounts: ${Date.now() - start}ms`,
      {
        accountCount: accountIds.length,
        resultCount: results.length,
      },
    );

    return results;
  }

  /**
   * Observe all active (non-deleted) transactions.
   *
   * @deprecated USE WITH EXTREME CAUTION. Loading ALL historical transactions causes
   * massive bridge congestion and OOM at scale. Prefer observeByDateRange() or
   * observeByAccounts() whenever possible.
   */
  observeAllActive_UNSAFE() {
    return this.transactions.query(...this.buildActiveClauses()).observe();
  }

  /**
   * Observe the COUNT of active transactions.
   * Efficient trigger: Signals changes without loading full models into memory.
   */
  observeActiveCount(shouldThrottle: boolean = true) {
    return this.transactions.query(...this.buildActiveClauses()).observeCount(shouldThrottle);
  }

  observeActiveWithColumns(columns: string[]) {
    return this.transactions.query(...this.buildActiveClauses()).observeWithColumns(columns);
  }

  /**
   * Observe transactions within a date range.
   * Use this instead of observeActive() when you only need a bounded window —
   * avoids deserializing the entire transaction history across the bridge.
   */
  observeByDateRange(startDate: number, endDate?: number) {
    const extra: any[] = [Q.where('transaction_date', Q.gte(startDate))];
    if (endDate !== undefined) {
      extra.push(Q.where('transaction_date', Q.lte(endDate)));
    }

    return this.transactions
      .query(...this.buildActiveClauses(extra))
      .observeWithColumns([
        'amount',
        'account_id',
        'transaction_date',
        'journal_id',
        'currency_code',
        'transaction_type',
      ]);
  }

  /**
   * Gets all transactions for a specific journal
   * Read-only drill-down from journals
   *
   * @param journalId Journal ID to fetch transactions for
   * @returns Array of transactions for the journal
   */
  async findByJournal(journalId: string): Promise<Transaction[]> {
    return this.transactions
      .query(Q.and(Q.where('journal_id', journalId), Q.where('deleted_at', Q.eq(null))))
      .extend(Q.sortBy('transaction_date', Q.asc))
      .extend(Q.sortBy('created_at', Q.asc))
      .fetch();
  }

  async findAllNonDeleted(): Promise<Transaction[]> {
    return this.transactions.query(Q.where('deleted_at', Q.eq(null))).fetch();
  }

  async countNonDeleted(): Promise<number> {
    return this.transactions.query(Q.where('deleted_at', Q.eq(null))).fetchCount();
  }

  /**
   * Updates a transaction
   */
  async update(transaction: Transaction, updates: Partial<Transaction>): Promise<Transaction> {
    return database.write(async () => {
      const updated = await transaction.update(tx => {
        Object.assign(tx, updates);
        tx.updatedAt = new Date();
      });

      return updated;
    });
  }

  /**
   * Soft deletes a transaction
   */
  async delete(transaction: Transaction): Promise<void> {
    await database.write(async () => {
      await transaction.update(t => {
        t.deletedAt = new Date();
      });
    });
  }

  /**
   * Finds the latest transaction for an account before a given date.
   * Strictly exclusive. Useful for finding the starting balance for a new transaction.
   */
  async findLatestForAccountBeforeDate(
    accountId: string,
    date: number,
  ): Promise<Transaction | null> {
    return this.findLatestForAccount(accountId, date, false);
  }

  /**
   * Finds the latest transaction for an account as of a given date.
   * @param accountId Account ID
   * @param date Cutoff date
   * @param inclusive Whether to include transactions at the exact millisecond (default: true)
   */
  async findLatestForAccount(
    accountId: string,
    date: number,
    inclusive: boolean = true,
  ): Promise<Transaction | null> {
    const transactions = await this.deterministicSort(
      this.transactions.query(
        ...this.buildActiveClauses([
          Q.where('account_id', accountId),
          Q.where('transaction_date', inclusive ? Q.lte(date) : Q.lt(date)),
        ]),
        Q.take(1),
      ),
    ).fetch();
    return transactions[0] || null;
  }

  /**
   * Finds all transactions for multiple accounts within a date range.
   * Optimized for bulk reporting.
   */
  async findByAccountsAndDateRange(
    accountIds: string[],
    startDate: number,
    endDate: number,
  ): Promise<Transaction[]> {
    const start = Date.now();
    const clauses = this.buildActiveClauses([
      Q.where('account_id', Q.oneOf(accountIds)),
      Q.where('transaction_date', Q.gte(startDate)),
      Q.where('transaction_date', Q.lte(endDate)),
    ]);

    // Batching logic: For large account sets, we chunk the query to prevent SQLite performance collapse.
    const CHUNK_SIZE = 100;
    const CONCURRENCY_LIMIT = 4; // Prevent bridge stampede
    let results: Transaction[] = [];

    if (accountIds.length <= CHUNK_SIZE) {
      results = await this.deterministicSort(this.transactions.query(...clauses), Q.desc).fetch();
    } else {
      // Seq/Parallel hybrid batch fetch to balance throughput and bridge health
      const allChunks: string[][] = [];
      for (let i = 0; i < accountIds.length; i += CHUNK_SIZE) {
        allChunks.push(accountIds.slice(i, i + CHUNK_SIZE));
      }

      const chunkResults: Transaction[][] = [];
      for (let i = 0; i < allChunks.length; i += CONCURRENCY_LIMIT) {
        const batch = allChunks.slice(i, i + CONCURRENCY_LIMIT);
        const batchResults = await Promise.all(
          batch.map(chunk => {
            const chunkClauses = this.buildActiveClauses([
              Q.where('account_id', Q.oneOf(chunk)),
              Q.where('transaction_date', Q.gte(startDate)),
              Q.where('transaction_date', Q.lte(endDate)),
            ]);
            return this.deterministicSort(this.transactions.query(...chunkClauses), Q.desc).fetch();
          }),
        );
        chunkResults.push(...batchResults);
      }

      // Merge and global sort in memory to ensure cross-chunk deterministic order
      results = chunkResults.flat().sort((a, b) => {
        const dateDiff = b.transactionDate - a.transactionDate;
        if (dateDiff !== 0) return dateDiff;
        const createDiff = b.createdAt.getTime() - a.createdAt.getTime();
        if (createDiff !== 0) return createDiff;
        return b.id.localeCompare(a.id);
      });
    }

    logger.info(
      `[Trace] TransactionRepository.findByAccountsAndDateRange: ${Date.now() - start}ms`,
      {
        accountCount: accountIds.length,
        resultCount: results.length,
      },
    );

    return results;
  }

  /**
   * Gets the transaction count for an account before a given date.
   */
  async getCountForAccount(accountId: string, cutoffDate: number = Date.now()): Promise<number> {
    return this.getCountForAccountBetween(accountId, 0, cutoffDate);
  }

  /**
   * Gets the transaction count for an account between two dates.
   * Useful for snapshot-optimized count retrieval.
   */
  async getCountForAccountBetween(
    accountId: string,
    startDate: number,
    endDate: number,
  ): Promise<number> {
    return this.transactions
      .query(
        ...this.buildActiveClauses([
          Q.where('account_id', accountId),
          Q.where('transaction_date', Q.gte(startDate)), // Fix boundary to be inclusive
          Q.where('transaction_date', Q.lte(endDate)),
        ]),
      )
      .fetchCount();
  }

  /**
   * Observe transaction count for a specific date range.
   * Useful as a "trigger" for reports.
   */
  observeCountByDateRange(startDate: number, endDate: number, shouldThrottle: boolean = true) {
    return this.transactions
      .query(
        ...this.buildActiveClauses([
          Q.where('transaction_date', Q.gte(startDate)),
          Q.where('transaction_date', Q.lte(endDate)),
        ]),
      )
      .observeCount(shouldThrottle);
  }

  observeByDateRangeWithColumns(startDate: number, endDate: number, columns: string[]) {
    return this.transactions
      .query(
        ...this.buildActiveClauses([
          Q.where('transaction_date', Q.gte(startDate)),
          Q.where('transaction_date', Q.lte(endDate)),
        ]),
      )
      .observeWithColumns(columns);
  }

  async findForAccountUpToDate(accountId: string, cutoffDate: number): Promise<Transaction[]> {
    return this.transactions
      .query(
        Q.experimentalJoinTables(['journals']),
        Q.where('account_id', accountId),
        Q.where('transaction_date', Q.lte(cutoffDate)),
        Q.where('deleted_at', Q.eq(null)),
        Q.on('journals', [
          Q.where('status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
          Q.where('deleted_at', Q.eq(null)),
        ]),
        Q.sortBy('transaction_date', Q.asc),
        Q.sortBy('created_at', Q.asc),
      )
      .fetch();
  }

  async hasTransactions(accountId: string): Promise<boolean> {
    const count = await this.transactions
      .query(...this.buildActiveClauses([Q.where('account_id', accountId)]))
      .fetchCount();
    return count > 0;
  }
}

export const transactionRepository = new TransactionRepository();
