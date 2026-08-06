import {
  AccountId,
  AccountType,
  JournalId,
  TransactionId,
  TransactionType,
  WorkplaceId,
} from '@/src/types/domain';
import { periodFlowSQL } from '@/src/services/accounting/BalanceEffects';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';
import { logger } from '@/src/utils/logger';
import { from, Observable } from 'rxjs';
import { distinctUntilChanged, map, switchMap } from 'rxjs/operators';
import { transactionRawMetricsQueries } from './raw/TransactionRawMetricsQueries';
import { transactionRawPatternQueries } from './raw/TransactionRawPatternQueries';
import { transactionRawRebuildQueries } from './raw/TransactionRawRebuildQueries';
import {
  AccountDelta,
  DailyDelta,
  RawSQLArg,
  RebuildTransaction,
  RecurringPattern,
  TransactionMetadata,
} from './TransactionTypes';

export interface AccountPeriodMetrics {
  totalIncrease: number;
  totalDecrease: number;
}

export interface RawPeriodMetricsRow {
  accountId: AccountId;
  totalIncrease: number;
  totalDecrease: number;
}

export interface RawUnreconciledMetricsRow {
  count: number;
  total: number | null;
}

interface RawTransactionMetadataRow {
  id: string;
  journalId: string;
  accountId: string;
  amount: number;
  transactionDate: number;
  transactionType: TransactionType;
  currencyCode: string;
}

/**
 * High-performance repository for raw SQL queries on transactions.
 * Delegates specialized queries to modular raw query engines while providing a unified facade.
 */
export class TransactionRawRepository {
  async queryRaw<T>(sql: string, args: RawSQLArg[] = [], table?: string): Promise<T[] | null> {
    return transactionRawMetricsQueries.queryRaw<T>(sql, args, table);
  }

  async getLatestBalancesRaw(
    workplaceId: WorkplaceId,
    accountIds: string[],
    cutoffDate: number = Number.MAX_SAFE_INTEGER,
  ): Promise<Map<string, number>> {
    return transactionRawMetricsQueries.getLatestBalancesRaw(workplaceId, accountIds, cutoffDate);
  }

  async getAccountSumRaw(
    workplaceId: WorkplaceId,
    accountId: AccountId,
    cutoffDate: number,
    accountType: AccountType,
    upToTransactionId?: TransactionId,
    afterTransactionId?: TransactionId,
  ): Promise<number> {
    return transactionRawRebuildQueries.getAccountSumRaw(
      workplaceId,
      accountId,
      cutoffDate,
      accountType,
      upToTransactionId,
      afterTransactionId,
    );
  }

  async getDailyDeltasGroupedRaw(
    workplaceId: WorkplaceId,
    accountIds: string[],
    startDate: number,
    endDate: number,
  ): Promise<DailyDelta[]> {
    return transactionRawMetricsQueries.getDailyDeltasGroupedRaw(
      workplaceId,
      accountIds,
      startDate,
      endDate,
    );
  }

  async getAccountDeltasGroupedRaw(
    workplaceId: WorkplaceId,
    accountIds: string[],
    startDate: number,
    endDate: number,
  ): Promise<AccountDelta[]> {
    return transactionRawMetricsQueries.getAccountDeltasGroupedRaw(
      workplaceId,
      accountIds,
      startDate,
      endDate,
    );
  }

  async getRebuildDataRaw(accountId: AccountId, startDate: number): Promise<RebuildTransaction[]> {
    return transactionRawRebuildQueries.getRebuildDataRaw(accountId, startDate);
  }

  async getRecurringPatternsRaw(startDate: number, minCount: number): Promise<RecurringPattern[]> {
    return transactionRawPatternQueries.getRecurringPatternsRaw(startDate, minCount);
  }

  async getLatestBalancesAndCountsRaw(
    workplaceId: WorkplaceId,
    accountIdsWithBoundaries: {
      accountId: AccountId;
      startDate: number;
      afterTransactionId?: string;
      afterTransactionDate?: number;
      afterTransactionCreatedAt?: number;
    }[],
    endDate: number,
  ): Promise<{
    balances: Map<string, number>;
    counts: Map<string, number>;
  }> {
    const [balances, counts] = await Promise.all([
      this.getLatestBalancesRaw(
        workplaceId,
        accountIdsWithBoundaries.map(b => b.accountId),
        endDate,
      ),
      this.getAccountTransactionCountsRaw(accountIdsWithBoundaries, endDate),
    ]);
    return { balances, counts };
  }

  /**
   * Counts transactions after each account's snapshot cursor (or all history when
   * there is no snapshot). Lower-bound pruning is per-account via `last_date` —
   * never a workplace-wide min snapshot date, which would hide older activity on
   * accounts that lack their own snapshot.
   */
  async getAccountTransactionCountsRaw(
    accountIdsWithBoundaries: {
      accountId: AccountId;
      startDate: number;
      afterTransactionId?: string;
      afterTransactionDate?: number;
      afterTransactionCreatedAt?: number;
    }[],
    endDate: number,
  ): Promise<Map<string, number>> {
    if (accountIdsWithBoundaries.length === 0) return new Map();

    const results = new Map<string, number>();
    for (const b of accountIdsWithBoundaries) results.set(b.accountId, 0);

    const CHUNK_SIZE = 100;
    for (let i = 0; i < accountIdsWithBoundaries.length; i += CHUNK_SIZE) {
      const chunk = accountIdsWithBoundaries.slice(i, i + CHUNK_SIZE);
      const placeholders = ACTIVE_JOURNAL_STATUSES.map(() => '?').join(',');

      const unionParts: string[] = [];
      const boundaryParams: (string | number)[] = [];

      for (const b of chunk) {
        unionParts.push('SELECT ? as acc_id, ? as last_date, ? as last_created, ? as last_id');
        boundaryParams.push(
          b.accountId,
          b.afterTransactionDate || 0,
          b.afterTransactionCreatedAt || 0,
          b.afterTransactionId || '',
        );
      }

      const sql = `
        WITH search_boundaries(acc_id, last_date, last_created, last_id) AS (
          ${unionParts.join(' UNION ALL ')}
        )
        SELECT t.account_id as accountId, COUNT(*) as count
        FROM transactions t
        JOIN journals j ON t.journal_id = j.id
        JOIN search_boundaries b ON t.account_id = b.acc_id
        WHERE t.deleted_at IS NULL
          AND j.deleted_at IS NULL
          AND j.status IN (${placeholders})
          AND t.transaction_date <= ?
          AND t.transaction_date >= b.last_date
          AND (
            b.last_id = '' 
            OR t.transaction_date > b.last_date 
            OR (t.transaction_date = b.last_date AND t.created_at > b.last_created)
            OR (t.transaction_date = b.last_date AND t.created_at = b.last_created AND t.id > b.last_id)
          )
        GROUP BY t.account_id
      `;

      const queryParams: (string | number)[] = [
        ...boundaryParams,
        ...ACTIVE_JOURNAL_STATUSES,
        endDate,
      ];

      const raws = await this.queryRaw<{ accountId: AccountId; count: number }>(sql, queryParams);
      if (raws !== null) {
        for (const row of raws) results.set(row.accountId, row.count);
      }
    }
    return results;
  }

  async getTransactionsMetadataRaw(
    workplaceId: WorkplaceId,
    accountIds: string[],
    startDate: number,
    endDate: number,
  ): Promise<TransactionMetadata[]> {
    if (accountIds.length === 0) return [];

    const accountPlaceholders = accountIds.map(() => '?').join(',');
    const placeholders = ACTIVE_JOURNAL_STATUSES.map(() => '?').join(',');

    const sql = `
      SELECT
        t.id,
        t.journal_id as journalId,
        t.account_id as accountId,
        t.amount,
        t.transaction_date as transactionDate,
        t.transaction_type as transactionType,
        t.currency_code as currencyCode
      FROM transactions t
      JOIN journals j ON t.journal_id = j.id
      WHERE t.account_id IN (${accountPlaceholders})
        AND t.transaction_date >= ?
        AND t.transaction_date <= ?
        AND t.deleted_at IS NULL
        AND j.deleted_at IS NULL
        AND j.workplace_id = ?
        AND j.status IN (${placeholders})
      ORDER BY t.transaction_date DESC
    `;

    const results = await this.queryRaw<RawTransactionMetadataRow>(sql, [
      ...accountIds,
      startDate,
      endDate,
      workplaceId,
      ...ACTIVE_JOURNAL_STATUSES,
    ]);

    return (results || []).map(row => ({
      ...row,
      id: row.id as TransactionId,
      journalId: row.journalId as JournalId,
      accountId: row.accountId as AccountId,
    }));
  }

  async getAccountPeriodMetricsRaw(
    workplaceId: WorkplaceId,
    accountId: AccountId,
    startDate: number,
    endDate: number,
    accountType: AccountType,
  ): Promise<{ totalIncrease: number; totalDecrease: number }> {
    const results = await this.getBulkAccountPeriodMetricsRaw(
      workplaceId,
      [{ accountId, accountType }],
      startDate,
      endDate,
    );
    return (
      results.get(accountId) || {
        totalIncrease: 0,
        totalDecrease: 0,
      }
    );
  }

  async getBulkAccountPeriodMetricsRaw(
    workplaceId: WorkplaceId,
    accountConfigs: { accountId: AccountId; accountType: AccountType }[],
    startDate: number,
    endDate: number,
  ): Promise<Map<string, { totalIncrease: number; totalDecrease: number }>> {
    if (accountConfigs.length === 0) return new Map();

    const accountIds = accountConfigs.map(c => c.accountId);
    const accountPlaceholders = accountIds.map(() => '?').join(',');
    const placeholders = ACTIVE_JOURNAL_STATUSES.map(() => '?').join(',');

    const { increaseCase, decreaseCase } = periodFlowSQL();
    const sql = `
      SELECT 
        t.account_id as accountId,
        SUM(${increaseCase}) as totalIncrease,
        SUM(${decreaseCase}) as totalDecrease
      FROM transactions t
      JOIN accounts a ON t.account_id = a.id
      JOIN journals j ON t.journal_id = j.id
      WHERE t.workplace_id = ?
        AND t.account_id IN (${accountPlaceholders})
        AND t.transaction_date >= ?
        AND t.transaction_date <= ?
        AND t.deleted_at IS NULL
        AND j.deleted_at IS NULL
        AND j.status IN (${placeholders})
      GROUP BY t.account_id
    `;

    const results = new Map<string, AccountPeriodMetrics>();
    try {
      const raws = await this.queryRaw<RawPeriodMetricsRow>(sql, [
        workplaceId,
        ...accountIds,
        startDate,
        endDate,
        ...ACTIVE_JOURNAL_STATUSES,
      ]);

      if (raws) {
        for (const row of raws) {
          results.set(row.accountId, {
            totalIncrease: row.totalIncrease,
            totalDecrease: row.totalDecrease,
          });
        }
      }
    } catch (error) {
      logger.error('Error in getBulkAccountPeriodMetricsRaw', error);
    }

    for (const config of accountConfigs) {
      if (!results.has(config.accountId)) {
        results.set(config.accountId, { totalIncrease: 0, totalDecrease: 0 });
      }
    }

    return results;
  }

  observeAccountPeriodMetricsRaw(
    workplaceId: WorkplaceId,
    accountId: AccountId,
    startDate: number,
    endDate: number,
    accountType: AccountType,
  ): Observable<AccountPeriodMetrics> {
    return from(import('./TransactionRepository')).pipe(
      switchMap(({ transactionRepository }) =>
        transactionRepository.observeActiveCount(workplaceId),
      ),
      switchMap(() =>
        from(
          this.getAccountPeriodMetricsRaw(workplaceId, accountId, startDate, endDate, accountType),
        ),
      ),
      distinctUntilChanged(
        (prev, curr) =>
          prev.totalIncrease === curr.totalIncrease && prev.totalDecrease === curr.totalDecrease,
      ),
    );
  }

  observeAccountDeltasGroupedRaw(
    workplaceId: WorkplaceId,
    accountIds: string[],
    startDate: number,
    endDate: number,
  ): Observable<AccountDelta[]> {
    return from(import('./TransactionRepository')).pipe(
      switchMap(({ transactionRepository }) =>
        transactionRepository.observeActiveCount(workplaceId),
      ),
      switchMap(() =>
        from(this.getAccountDeltasGroupedRaw(workplaceId, accountIds, startDate, endDate)),
      ),
    );
  }

  observeUnreconciledMetricsRaw(
    workplaceId: WorkplaceId,
    accountId: AccountId,
    reconciledAt: number | null,
    accountType: AccountType,
  ): Observable<{ count: number; total: number }> {
    const activeStatusesStr = ACTIVE_JOURNAL_STATUSES.map(s => `'${s}'`).join(',');
    const { increaseCase, decreaseCase } = periodFlowSQL();
    return from(import('./TransactionRepository')).pipe(
      switchMap(({ transactionRepository }) =>
        transactionRepository.observeActiveCount(workplaceId),
      ),
      switchMap(() => {
        const sql = `
          SELECT COUNT(*) as count, SUM(${increaseCase}) - SUM(${decreaseCase}) as total
          FROM transactions t
          JOIN accounts a ON t.account_id = a.id
          JOIN journals j ON t.journal_id = j.id
          WHERE t.account_id = ?
            AND a.account_type = ?
            AND (t.transaction_date > ? OR ? IS NULL)
            AND t.deleted_at IS NULL
            AND j.deleted_at IS NULL
            AND j.workplace_id = ?
            AND j.status IN (${activeStatusesStr})
        `;
        return from(
          this.queryRaw<RawUnreconciledMetricsRow>(sql, [
            accountId,
            accountType,
            reconciledAt || 0,
            reconciledAt ?? 0,
            workplaceId,
          ]),
        );
      }),
      map((raws: RawUnreconciledMetricsRow[] | null) => ({
        count: raws?.[0]?.count || 0,
        total: raws?.[0]?.total || 0,
      })),
    );
  }
}

export const transactionRawRepository = new TransactionRawRepository();
