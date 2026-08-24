import { AppConfig } from '@/src/constants/app-config';
import { database } from '@/src/data/database/Database';
import Transaction from '@/src/data/models/Transaction';
import { AccountId, JournalId, TransactionId, WorkplaceId } from '@/src/types/ids';
import { logger } from '@/src/utils/logger';
import { Q } from '@nozbe/watermelondb';
import { buildActiveClauses, deterministicSort } from './transactionActiveClauses';

export class TransactionQueryRepository {
  private get transactions() {
    return database.collections.get<Transaction>('transactions');
  }

  async findEarliest(workplaceId: WorkplaceId): Promise<Transaction | null> {
    const transactions = await this.transactions
      .query(...buildActiveClauses(workplaceId), Q.sortBy('transaction_date', Q.asc), Q.take(1))
      .fetch();
    return transactions[0] ?? null;
  }

  async find(workplaceId: WorkplaceId, id: TransactionId): Promise<Transaction | null> {
    try {
      const transaction = await this.transactions.find(id);
      if (transaction.deletedAt) return null;
      if (transaction.workplaceId !== workplaceId) return null;
      return transaction;
    } catch {
      return null;
    }
  }

  async findByAccount(
    workplaceId: WorkplaceId,
    accountId: AccountId,
    limit?: number,
    dateRange?: { startDate: number; endDate: number },
    sortOrder: 'asc' | 'desc' = 'desc',
  ): Promise<Transaction[]> {
    const qSort = sortOrder === 'asc' ? Q.asc : Q.desc;
    const clauses = buildActiveClauses(workplaceId, [Q.where('account_id', accountId)]);

    if (dateRange) {
      clauses.push(Q.where('transaction_date', Q.gte(dateRange.startDate)));
      clauses.push(Q.where('transaction_date', Q.lte(dateRange.endDate)));
    }

    let query = deterministicSort(this.transactions.query(...clauses), qSort);

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

  async findByJournals(workplaceId: WorkplaceId, journalIds: JournalId[]): Promise<Transaction[]> {
    if (journalIds.length === 0) return [];
    const CHUNK_SIZE = 100;
    if (journalIds.length <= CHUNK_SIZE) {
      return this.transactions
        .query(
          Q.where('journal_id', Q.oneOf(journalIds)),
          Q.where('deleted_at', Q.eq(null)),
          Q.where('workplace_id', workplaceId),
        )
        .fetch();
    }

    const results: Transaction[] = [];
    for (let i = 0; i < journalIds.length; i += CHUNK_SIZE) {
      const chunk = journalIds.slice(i, i + CHUNK_SIZE);
      const batch = await this.transactions
        .query(
          Q.where('journal_id', Q.oneOf(chunk)),
          Q.where('deleted_at', Q.eq(null)),
          Q.where('workplace_id', workplaceId),
        )
        .fetch();
      results.push(...batch);
    }
    return results;
  }

  async findByIds(workplaceId: WorkplaceId, ids: string[]): Promise<Transaction[]> {
    if (ids.length === 0) return [];
    const CHUNK_SIZE = 100;
    if (ids.length <= CHUNK_SIZE) {
      return this.transactions
        .query(
          Q.where('id', Q.oneOf(ids)),
          Q.where('deleted_at', Q.eq(null)),
          Q.where('workplace_id', workplaceId),
        )
        .fetch();
    }

    const results: Transaction[] = [];
    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunk = ids.slice(i, i + CHUNK_SIZE);
      const batch = await this.transactions
        .query(
          Q.where('id', Q.oneOf(chunk)),
          Q.where('deleted_at', Q.eq(null)),
          Q.where('workplace_id', workplaceId),
        )
        .fetch();
      results.push(...batch);
    }
    return results;
  }

  async findTransactionsByAccounts(
    workplaceId: WorkplaceId,
    accountIds: string[],
    limit: number = AppConfig.pagination.defaultPageSize,
    dateRange?: { startDate: number; endDate: number },
  ): Promise<Transaction[]> {
    const clauses = buildActiveClauses(workplaceId, [Q.where('account_id', Q.oneOf(accountIds))]);

    if (dateRange) {
      clauses.push(Q.where('transaction_date', Q.gte(dateRange.startDate)));
      clauses.push(Q.where('transaction_date', Q.lte(dateRange.endDate)));
    }

    let query = deterministicSort(this.transactions.query(...clauses), Q.desc);

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

  async findByJournal(workplaceId: WorkplaceId, journalId: JournalId): Promise<Transaction[]> {
    return this.transactions
      .query(
        Q.where('journal_id', journalId),
        Q.where('deleted_at', Q.eq(null)),
        Q.where('workplace_id', workplaceId),
      )
      .extend(Q.sortBy('transaction_date', Q.asc))
      .extend(Q.sortBy('created_at', Q.asc))
      .fetch();
  }

  async findAllNonDeleted(workplaceId: WorkplaceId): Promise<Transaction[]> {
    return this.transactions
      .query(Q.where('deleted_at', Q.eq(null)), Q.where('workplace_id', workplaceId))
      .fetch();
  }

  async countNonDeleted(workplaceId: WorkplaceId): Promise<number> {
    return this.transactions
      .query(Q.where('deleted_at', Q.eq(null)), Q.where('workplace_id', workplaceId))
      .fetchCount();
  }

  async findLatestForAccountBeforeDate(
    workplaceId: WorkplaceId,
    accountId: AccountId,
    date: number,
  ): Promise<Transaction | null> {
    return this.findLatestForAccount(workplaceId, accountId, date, false);
  }

  async findLatestForAccount(
    workplaceId: WorkplaceId,
    accountId: AccountId,
    date: number,
    inclusive: boolean = true,
  ): Promise<Transaction | null> {
    const transactions = await deterministicSort(
      this.transactions.query(
        ...buildActiveClauses(workplaceId, [
          Q.where('account_id', accountId),
          Q.where('transaction_date', inclusive ? Q.lte(date) : Q.lt(date)),
        ]),
        Q.take(1),
      ),
    ).fetch();
    return transactions[0] || null;
  }

  async findByAccountsAndDateRange(
    workplaceId: WorkplaceId,
    accountIds: string[],
    startDate: number,
    endDate: number,
  ): Promise<Transaction[]> {
    const start = Date.now();
    const clauses = buildActiveClauses(workplaceId, [
      Q.where('account_id', Q.oneOf(accountIds)),
      Q.where('transaction_date', Q.gte(startDate)),
      Q.where('transaction_date', Q.lte(endDate)),
    ]);

    const CHUNK_SIZE = 100;
    const CONCURRENCY_LIMIT = 4;
    let results: Transaction[] = [];

    if (accountIds.length <= CHUNK_SIZE) {
      results = await deterministicSort(this.transactions.query(...clauses), Q.desc).fetch();
    } else {
      const allChunks: string[][] = [];
      for (let i = 0; i < accountIds.length; i += CHUNK_SIZE) {
        allChunks.push(accountIds.slice(i, i + CHUNK_SIZE));
      }

      const chunkResults: Transaction[][] = [];
      for (let i = 0; i < allChunks.length; i += CONCURRENCY_LIMIT) {
        const batch = allChunks.slice(i, i + CONCURRENCY_LIMIT);
        const batchResults = await Promise.all(
          batch.map(chunk => {
            const chunkClauses = buildActiveClauses(workplaceId, [
              Q.where('account_id', Q.oneOf(chunk)),
              Q.where('transaction_date', Q.gte(startDate)),
              Q.where('transaction_date', Q.lte(endDate)),
            ]);
            return deterministicSort(this.transactions.query(...chunkClauses), Q.desc).fetch();
          }),
        );
        chunkResults.push(...batchResults);
      }

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

  async getCountForAccount(
    workplaceId: WorkplaceId,
    accountId: AccountId,
    cutoffDate: number = Date.now(),
  ): Promise<number> {
    return this.getCountForAccountBetween(workplaceId, accountId, 0, cutoffDate);
  }

  async getCountForAccountBetween(
    workplaceId: WorkplaceId,
    accountId: AccountId,
    startDate: number,
    endDate: number,
  ): Promise<number> {
    return this.transactions
      .query(
        ...buildActiveClauses(workplaceId, [
          Q.where('account_id', accountId),
          Q.where('transaction_date', Q.gte(startDate)),
          Q.where('transaction_date', Q.lte(endDate)),
        ]),
      )
      .fetchCount();
  }

  async findForAccountUpToDate(
    workplaceId: WorkplaceId,
    accountId: AccountId,
    cutoffDate: number,
  ): Promise<Transaction[]> {
    return this.transactions
      .query(
        ...buildActiveClauses(workplaceId, [
          Q.where('account_id', accountId),
          Q.where('transaction_date', Q.lte(cutoffDate)),
        ]),
        Q.sortBy('transaction_date', Q.asc),
        Q.sortBy('created_at', Q.asc),
      )
      .fetch();
  }

  async hasTransactions(workplaceId: WorkplaceId, accountId: AccountId): Promise<boolean> {
    const count = await this.transactions
      .query(...buildActiveClauses(workplaceId, [Q.where('account_id', accountId)]))
      .fetchCount();
    return count > 0;
  }

  async findAllByAccountIds(
    workplaceId: WorkplaceId,
    accountIds: AccountId[],
  ): Promise<Transaction[]> {
    if (accountIds.length === 0) return [];
    return this.transactions
      .query(
        Q.where('account_id', Q.oneOf(accountIds)),
        Q.where('deleted_at', Q.eq(null)),
        Q.where('workplace_id', workplaceId),
      )
      .fetch();
  }
}

export const transactionQueryRepository = new TransactionQueryRepository();
