import { database } from '@/src/data/database/Database';
import { getAccountBalanceDelta } from '@/src/utils/accountingHelpers';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';
import { logger } from '@/src/utils/logger';
import { Q } from '@nozbe/watermelondb';
import dayjs from 'dayjs';
import { from, map, Observable } from 'rxjs';
import { distinctUntilChanged, switchMap } from 'rxjs/operators';
import { getRawAdapter } from '../database/DatabaseUtils';
import Account, { AccountType } from '../models/Account';
import Transaction, { TransactionType } from '../models/Transaction';
import { transactionRepository } from './TransactionRepository';
import {
  AccountDelta,
  DailyDelta,
  RawSQLArg,
  RebuildTransaction,
  RecurringPattern,
} from './TransactionTypes';

/**
 * Internal interfaces for raw SQL result sets.
 * These ensure type-safety at the database-to-domain boundary.
 */
interface RawPeriodMetricsRow {
  accountId: string;
  totalDebit: number;
  totalCredit: number;
}

interface RawUnreconciledMetricsRow {
  count: number;
  total: number | null;
}

/**
 * Mapped result types for domain consumption.
 */
export interface AccountPeriodMetrics {
  totalIncrease: number;
  totalDecrease: number;
}

/**
 * Specialized repository for high-performance raw SQL queries on transactions.
 * Bypasses the WatermelonDB bridge/ORM layers for bulk data operations.
 */
export class TransactionRawRepository {
  private keyCache: Map<string, string> = new Map();
  private mappingCache: Map<string, { original: string; camel: string }[]> = new Map();

  private toCamelCase(str: string): string {
    const cached = this.keyCache.get(str);
    if (cached) return cached;
    const result = str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    this.keyCache.set(str, result);
    return result;
  }

  private getSignedDelta(
    accountType: AccountType,
    transactionType: string,
    amount: number,
  ): number {
    return getAccountBalanceDelta(amount, accountType, transactionType as TransactionType);
  }

  /**
   * Universal raw query helper for consolidated SQL aliasing.
   */
  async queryRaw<T>(sql: string, args: RawSQLArg[] = [], table?: string): Promise<T[] | null> {
    const sqlAdapter = getRawAdapter(database);
    if (!sqlAdapter || typeof sqlAdapter.queryRaw !== 'function') return null;

    try {
      const result = await sqlAdapter.queryRaw(sql, args, table);
      const rawRows = Array.isArray(result) ? result : result?.rows || [];

      if (rawRows.length === 0) return [];

      // High-performance mapping: Pre-calculate key transformations ONCE per schema signature
      const sampleRow = rawRows[0];
      const keys = Object.keys(sampleRow);
      const schemaSignature = keys.join('|');

      let mapping = this.mappingCache.get(schemaSignature);
      if (!mapping) {
        mapping = keys.map(key => {
          const lower = key.toLowerCase();
          return {
            original: key,
            camel: this.toCamelCase(lower),
          };
        });
        this.mappingCache.set(schemaSignature, mapping);
      }

      const mappingLen = mapping.length;
      const resultRows: T[] = new Array(rawRows.length);

      for (let r = 0; r < rawRows.length; r++) {
        const row = rawRows[r] as Record<string, unknown>;
        const normalized: Record<string, unknown> = {};

        for (let i = 0; i < mappingLen; i++) {
          const m = mapping[i];
          const val = row[m.original];
          normalized[m.original] = val;
          if (m.original !== m.camel) {
            normalized[m.camel] = val;
          }
        }
        resultRows[r] = normalized as T;
      }
      return resultRows;
    } catch (error: unknown) {
      const e = error as Error & { code?: string };
      logger.error(`[TransactionRawRepository] queryRaw failed`, {
        sql: sql.substring(0, 1000),
        errorMessage: e?.message || 'Unknown error',
        errorCode: e?.code,
        errorName: e?.name,
        stack: e?.stack?.substring(0, 200),
      });
      // Do not swallow errors - financial integrity depends on accurate results
      throw error;
    }
  }

  /**
   * Fetches the latest running balance for multiple accounts in a single pass.
   * Returns a Map of accountId -> latest runningBalance.
   */
  async getLatestBalancesRaw(
    workplaceId: string,
    accountIds: string[],
    cutoffDate: number = Number.MAX_SAFE_INTEGER,
  ): Promise<Map<string, number>> {
    if (accountIds.length === 0) return new Map();

    const accountPlaceholders = accountIds.map(() => '?').join(',');
    const placeholders = ACTIVE_JOURNAL_STATUSES.map(() => '?').join(',');

    const sql = `
      WITH RankedTransactions AS (
        SELECT 
          t.account_id AS accountId, 
          t.running_balance AS runningBalance,
          ROW_NUMBER() OVER (
            PARTITION BY t.account_id 
            ORDER BY t.transaction_date DESC, t.created_at DESC, t.id DESC
          ) as rn
        FROM transactions t
        JOIN journals j ON t.journal_id = j.id
        WHERE t.account_id IN (${accountPlaceholders})
          AND t.transaction_date <= ?
          AND t.deleted_at IS NULL
          AND j.workplace_id = ?
          AND j.deleted_at IS NULL
          AND j.status IN (${placeholders})
      )
      SELECT accountId, runningBalance
      FROM RankedTransactions
      WHERE rn = 1
    `;

    const raws = await this.queryRaw<{ accountId: string; runningBalance: number }>(sql, [
      ...accountIds,
      cutoffDate,
      workplaceId,
      ...ACTIVE_JOURNAL_STATUSES,
    ]);

    if (raws !== null) {
      if (raws.length === 0) return new Map();
      return new Map(raws.map(r => [r.accountId, r.runningBalance]));
    }

    // Fallback path is significantly slower (O(N) queries)
    logger.warn(
      '[TransactionRawRepository] getLatestBalancesRaw falling back to ORM loop. Performance risk.',
    );

    // Fallback for LokiJS/Test
    const results = new Map<string, number>();
    for (const accountId of accountIds) {
      const txs = await database.collections
        .get<Transaction>('transactions')
        .query(
          Q.on('journals', 'workplace_id', Q.eq(workplaceId)),
          Q.on('journals', 'status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
          Q.on('journals', 'deleted_at', Q.eq(null)),
          Q.where('account_id', accountId),
          Q.where('transaction_date', Q.lte(cutoffDate)),
          Q.where('deleted_at', Q.eq(null)),
          Q.sortBy('transaction_date', Q.desc),
          Q.sortBy('created_at', Q.desc),
          Q.take(1),
        )
        .fetch();
      results.set(accountId, txs[0]?.runningBalance || 0);
    }
    return results;
  }

  /**
   * Fetches the total SUM of transaction amounts for an account as of a date.
   * Used for balance verification and recomputation.
   */
  async getAccountSumRaw(
    workplaceId: string,
    accountId: string,
    cutoffDate: number,
    isAssetOrExpense: boolean = true,
    upToTransactionId?: string,
    afterTransactionId?: string,
  ): Promise<number> {
    const multiplierSql = isAssetOrExpense
      ? `CASE WHEN t.transaction_type = '${TransactionType.DEBIT}' THEN t.amount ELSE -t.amount END`
      : `CASE WHEN t.transaction_type = '${TransactionType.CREDIT}' THEN t.amount ELSE -t.amount END`;

    const placeholders = ACTIVE_JOURNAL_STATUSES.map(() => '?').join(',');

    const sql = `
      SELECT SUM(${multiplierSql}) as total
      FROM transactions t
      JOIN journals j ON t.journal_id = j.id
      WHERE t.account_id = ?
        AND t.transaction_date <= ?
        AND t.deleted_at IS NULL
        AND j.workplace_id = ?
        AND j.deleted_at IS NULL
        AND j.status IN (${placeholders})
        ${
          upToTransactionId
            ? `AND (t.transaction_date < (SELECT transaction_date FROM transactions WHERE id = ?)
                OR (t.transaction_date = (SELECT transaction_date FROM transactions WHERE id = ?) 
                    AND t.created_at < (SELECT created_at FROM transactions WHERE id = ?))
                OR (t.transaction_date = (SELECT transaction_date FROM transactions WHERE id = ?)
                    AND t.created_at = (SELECT created_at FROM transactions WHERE id = ?)
                    AND t.id <= ?))`
            : ''
        }
        ${
          afterTransactionId
            ? `AND (t.transaction_date > (SELECT transaction_date FROM transactions WHERE id = ?)
                OR (t.transaction_date = (SELECT transaction_date FROM transactions WHERE id = ?) 
                    AND t.created_at > (SELECT created_at FROM transactions WHERE id = ?))
                OR (t.transaction_date = (SELECT transaction_date FROM transactions WHERE id = ?)
                    AND t.created_at = (SELECT created_at FROM transactions WHERE id = ?)
                    AND t.id > ?))`
            : ''
        }
    `;
    const args: RawSQLArg[] = [accountId, cutoffDate, workplaceId, ...ACTIVE_JOURNAL_STATUSES];
    if (upToTransactionId) {
      args.push(
        upToTransactionId,
        upToTransactionId,
        upToTransactionId,
        upToTransactionId,
        upToTransactionId,
        upToTransactionId,
      );
    }
    if (afterTransactionId) {
      args.push(
        afterTransactionId,
        afterTransactionId,
        afterTransactionId,
        afterTransactionId,
        afterTransactionId,
        afterTransactionId,
      );
    }

    const raws = await this.queryRaw<{ total: number }>(sql, args);
    if (raws !== null) return raws[0]?.total || 0;

    // Fallback for LokiJS/Test
    // Fix: Fallback was incorrectly returning latest runningBalance instead of SUM of deltas
    const filterClauses: Q.Clause[] = [
      Q.on('journals', 'status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
      Q.on('journals', 'deleted_at', Q.eq(null)),
      Q.on('journals', 'workplace_id', Q.eq(workplaceId)),
      Q.where('account_id', accountId),
      Q.where('transaction_date', Q.lte(cutoffDate)),
      Q.where('deleted_at', Q.eq(null)),
    ];

    if (upToTransactionId || afterTransactionId) {
      // Simple fallback: If boundaries are used, fetch all transactions and sum in JS
      // This is slow but functionally correct for tests/web environments
      const txs = await database.collections
        .get<Transaction>('transactions')
        .query(...filterClauses)
        .fetch();

      let sum = 0;
      let startFound = !afterTransactionId;
      let endReached = false;

      // Sort by date, then created_at, then id to match SQL logic
      const sortedTxs = [...txs].sort((a, b) => {
        if (a.transactionDate !== b.transactionDate) return a.transactionDate - b.transactionDate;
        const aCreated = a.createdAt instanceof Date ? a.createdAt.getTime() : a.createdAt || 0;
        const bCreated = b.createdAt instanceof Date ? b.createdAt.getTime() : b.createdAt || 0;
        if (aCreated !== bCreated) return (aCreated as number) - (bCreated as number);
        return a.id.localeCompare(b.id);
      });

      for (const tx of sortedTxs) {
        if (endReached) break;

        if (afterTransactionId && tx.id === afterTransactionId) {
          startFound = true;
          continue; // Skip the start transaction itself
        }

        if (startFound) {
          sum += this.getSignedDelta(
            isAssetOrExpense ? AccountType.ASSET : AccountType.LIABILITY,
            tx.transactionType,
            tx.amount,
          );
        }

        if (upToTransactionId && tx.id === upToTransactionId) {
          endReached = true;
        }
      }
      return sum;
    }

    // Full sum (no boundaries) fallback
    const txs = await database.collections
      .get<Transaction>('transactions')
      .query(...filterClauses)
      .fetch();
    return txs.reduce(
      (acc, tx) =>
        acc +
        this.getSignedDelta(
          isAssetOrExpense ? AccountType.ASSET : AccountType.LIABILITY,
          tx.transactionType,
          tx.amount,
        ),
      0,
    );
  }

  /**
   * Fetches daily net balance changes grouped by day, currency, and account type.
   * Optimized for bulk currency conversion in wealth history.
   */
  async getDailyDeltasGroupedRaw(
    workplaceId: string,
    accountIds: string[],
    startDate: number,
    endDate: number,
  ): Promise<DailyDelta[]> {
    if (accountIds.length === 0) return [];

    const accountPlaceholders = accountIds.map(() => '?').join(',');
    const placeholders = ACTIVE_JOURNAL_STATUSES.map(() => '?').join(',');

    const sql = `
      SELECT
        strftime('%Y-%m-%d', t.transaction_date / 1000, 'unixepoch', 'localtime') AS dayStartStr,
        t.currency_code AS currencyCode,
        a.account_type AS accountType,
        SUM(
          CASE
            WHEN a.account_type IN ('ASSET', 'EXPENSE')
              THEN CASE WHEN t.transaction_type = '${TransactionType.DEBIT}' THEN t.amount ELSE -t.amount END
            ELSE CASE WHEN t.transaction_type = '${TransactionType.CREDIT}' THEN t.amount ELSE -t.amount END
          END
        ) AS delta
      FROM transactions t
      JOIN accounts a ON t.account_id = a.id
      JOIN journals j ON t.journal_id = j.id
      WHERE t.account_id IN (${accountPlaceholders})
        AND t.transaction_date >= ?
        AND t.transaction_date <= ?
        AND t.deleted_at IS NULL
        AND j.deleted_at IS NULL
        AND j.workplace_id = ?
        AND j.status IN (${placeholders})
      GROUP BY dayStartStr, t.currency_code, a.account_type
      ORDER BY dayStartStr ASC
    `;

    const raws = await this.queryRaw<any>(sql, [
      ...accountIds,
      startDate,
      endDate,
      workplaceId,
      ...ACTIVE_JOURNAL_STATUSES,
    ]);

    if (raws !== null) {
      return raws.map((r: any) => ({
        ...r,
        dayStart: new Date(r.dayStartStr + 'T00:00:00').getTime(),
      }));
    }

    // Fallback for LokiJS/Test
    const [accounts, txs] = await Promise.all([
      database.collections
        .get<Account>('accounts')
        .query(Q.where('id', Q.oneOf(accountIds)))
        .fetch(),
      database.collections
        .get<Transaction>('transactions')
        .query(
          Q.on('journals', 'workplace_id', Q.eq(workplaceId)),
          Q.on('journals', 'status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
          Q.on('journals', 'deleted_at', Q.eq(null)),
          Q.where('account_id', Q.oneOf(accountIds)),
          Q.where('transaction_date', Q.gte(startDate)),
          Q.where('transaction_date', Q.lte(endDate)),
          Q.where('deleted_at', Q.eq(null)),
        )
        .fetch(),
    ]);

    const accountTypeById = new Map(accounts.map(a => [a.id, a.accountType]));
    const grouped = new Map<string, DailyDelta>();

    for (const tx of txs) {
      const accountType = accountTypeById.get(tx.accountId);
      if (!accountType) continue;

      const dayStart = dayjs(tx.transactionDate).startOf('day').valueOf();
      const key = `${dayStart}|${tx.currencyCode}|${accountType}`;
      const delta = this.getSignedDelta(accountType, tx.transactionType, tx.amount);
      const existing = grouped.get(key);

      if (existing) {
        existing.delta += delta;
      } else {
        grouped.set(key, {
          dayStart,
          currencyCode: tx.currencyCode,
          accountType,
          delta,
        });
      }
    }

    return Array.from(grouped.values()).sort((a, b) => a.dayStart - b.dayStart);
  }

  /**
   * Fetches net changes grouped by account and currency.
   * Optimized for breakdown reports.
   */
  async getAccountDeltasGroupedRaw(
    workplaceId: string,
    accountIds: string[],
    startDate: number,
    endDate: number,
  ): Promise<AccountDelta[]> {
    if (accountIds.length === 0) return [];

    const accountPlaceholders = accountIds.map(() => '?').join(',');
    const placeholders = ACTIVE_JOURNAL_STATUSES.map(() => '?').join(',');

    const sql = `
      SELECT
        t.account_id AS accountId,
        t.currency_code AS currencyCode,
        SUM(
          CASE
            WHEN a.account_type IN ('ASSET', 'EXPENSE')
              THEN CASE WHEN t.transaction_type = '${TransactionType.DEBIT}' THEN t.amount ELSE -t.amount END
            ELSE CASE WHEN t.transaction_type = '${TransactionType.CREDIT}' THEN t.amount ELSE -t.amount END
          END
        ) AS delta
      FROM transactions t
      JOIN accounts a ON t.account_id = a.id
      JOIN journals j ON t.journal_id = j.id
      WHERE t.account_id IN (${accountPlaceholders})
        AND t.transaction_date >= ?
        AND t.transaction_date <= ?
        AND t.deleted_at IS NULL
        AND j.deleted_at IS NULL
        AND j.workplace_id = ?
        AND j.status IN (${placeholders})
      GROUP BY t.account_id, t.currency_code
    `;

    const raws = await this.queryRaw<AccountDelta>(sql, [
      ...accountIds,
      startDate,
      endDate,
      workplaceId,
      ...ACTIVE_JOURNAL_STATUSES,
    ]);

    if (__DEV__) {
      logger.debug('[DEBUG_REPORT] getAccountDeltasGroupedRaw called', {
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        accountIds,
        rawsCount: raws?.length,
      });
    }

    if (raws !== null) return raws;

    // Fallback for LokiJS/Test
    const [accounts, txs] = await Promise.all([
      database.collections
        .get<Account>('accounts')
        .query(Q.where('id', Q.oneOf(accountIds)))
        .fetch(),
      database.collections
        .get<Transaction>('transactions')
        .query(
          Q.on('journals', 'workplace_id', Q.eq(workplaceId)),
          Q.on('journals', 'status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
          Q.on('journals', 'deleted_at', Q.eq(null)),
          Q.where('account_id', Q.oneOf(accountIds)),
          Q.where('transaction_date', Q.gte(startDate)),
          Q.where('transaction_date', Q.lte(endDate)),
          Q.where('deleted_at', Q.eq(null)),
        )
        .fetch(),
    ]);

    const accountTypeById = new Map(accounts.map(a => [a.id, a.accountType]));
    const grouped = new Map<string, AccountDelta>();

    for (const tx of txs) {
      const accountType = accountTypeById.get(tx.accountId);
      if (!accountType) continue;

      const key = `${tx.accountId}|${tx.currencyCode}`;
      const delta = this.getSignedDelta(accountType, tx.transactionType, tx.amount);
      const existing = grouped.get(key);

      if (existing) {
        existing.delta += delta;
      } else {
        grouped.set(key, {
          accountId: tx.accountId,
          currencyCode: tx.currencyCode,
          delta,
        });
      }
    }

    return Array.from(grouped.values());
  }

  /**
   * Fetches minimal transaction data for an account rebuild.
   * Optimized for AccountingRebuildService.
   */
  async getRebuildDataRaw(accountId: string, startDate: number): Promise<RebuildTransaction[]> {
    const placeholders = ACTIVE_JOURNAL_STATUSES.map(() => '?').join(',');

    const sql = `
      SELECT
        t.id,
        t.amount,
        t.transaction_type AS transactionType,
        t.transaction_date AS transactionDate,
        t.running_balance AS runningBalance,
        t.created_at AS createdAt
      FROM transactions t
      JOIN journals j ON t.journal_id = j.id
      WHERE t.account_id = ?
        AND t.transaction_date >= ?
        AND t.deleted_at IS NULL
        AND j.deleted_at IS NULL
        AND j.status IN (${placeholders})
      ORDER BY t.transaction_date ASC, t.created_at ASC, t.id ASC
    `;

    const raws = await this.queryRaw<RebuildTransaction>(sql, [
      accountId,
      startDate,
      ...ACTIVE_JOURNAL_STATUSES,
    ]);
    if (raws !== null) return raws;

    // Fallback for LokiJS/Test
    const txs = await database.collections
      .get<Transaction>('transactions')
      .query(
        Q.on('journals', 'status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
        Q.on('journals', 'deleted_at', Q.eq(null)),
        Q.where('account_id', accountId),
        Q.where('transaction_date', Q.gte(startDate)),
        Q.where('deleted_at', Q.eq(null)),
        Q.sortBy('transaction_date', Q.asc),
        Q.sortBy('created_at', Q.asc),
      )
      .fetch();

    return txs.map((tx: Transaction) => ({
      id: tx.id,
      amount: tx.amount,
      transactionType: tx.transactionType,
      transactionDate: tx.transactionDate,
      runningBalance: tx.runningBalance ?? null,
      createdAt: tx.createdAt.getTime(),
    }));
  }

  /**
   * Finds potential recurring transactions by grouping by amount and account.
   */
  async getRecurringPatternsRaw(startDate: number, minCount: number): Promise<RecurringPattern[]> {
    const placeholders = ACTIVE_JOURNAL_STATUSES.map(() => '?').join(',');

    const sql = `
      SELECT
        t.amount,
        t.account_id AS accountId,
        t.currency_code AS currencyCode,
        COUNT(*) AS occurrenceCount,
        GROUP_CONCAT(t.journal_id) AS journalIds,
        MIN(t.transaction_date) AS firstDate,
        MAX(t.transaction_date) AS lastDate
      FROM transactions t
      JOIN journals j ON t.journal_id = j.id
      WHERE t.transaction_date >= ?
        AND t.deleted_at IS NULL
        AND j.deleted_at IS NULL
        AND j.status IN (${placeholders})
      GROUP BY t.amount, t.account_id, t.currency_code
      HAVING COUNT(*) >= ?
      ORDER BY occurrenceCount DESC
    `;

    const raws = await this.queryRaw<RecurringPattern>(sql, [
      startDate,
      ...ACTIVE_JOURNAL_STATUSES,
      minCount,
    ]);
    if (raws !== null) return raws;

    // Fallback for LokiJS/Test
    const txs = await database.collections
      .get<Transaction>('transactions')
      .query(
        Q.on('journals', 'status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
        Q.on('journals', 'deleted_at', Q.eq(null)),
        Q.where('transaction_date', Q.gte(startDate)),
        Q.where('deleted_at', Q.eq(null)),
      )
      .fetch();

    const grouped = new Map<
      string,
      {
        amount: number;
        accountId: string;
        currencyCode: string;
        occurrenceCount: number;
        journalIds: Set<string>;
        firstDate: number;
        lastDate: number;
      }
    >();

    for (const tx of txs) {
      const key = `${tx.amount}|${tx.accountId}|${tx.currencyCode}`;
      const existing = grouped.get(key);

      if (existing) {
        existing.occurrenceCount += 1;
        existing.journalIds.add(tx.journalId);
        if (tx.transactionDate < existing.firstDate) existing.firstDate = tx.transactionDate;
        if (tx.transactionDate > existing.lastDate) existing.lastDate = tx.transactionDate;
      } else {
        grouped.set(key, {
          amount: tx.amount,
          accountId: tx.accountId,
          currencyCode: tx.currencyCode,
          occurrenceCount: 1,
          journalIds: new Set([tx.journalId]),
          firstDate: tx.transactionDate,
          lastDate: tx.transactionDate,
        });
      }
    }

    return Array.from(grouped.values())
      .filter(g => g.occurrenceCount >= minCount)
      .sort((a, b) => b.occurrenceCount - a.occurrenceCount)
      .map(g => ({
        amount: g.amount,
        accountId: g.accountId,
        currencyCode: g.currencyCode,
        occurrenceCount: g.occurrenceCount,
        journalIds: Array.from(g.journalIds).join(','),
        firstDate: g.firstDate,
        lastDate: g.lastDate,
      }));
  }

  /**
   * Fetches transaction counts for multiple accounts between two dates.
   * Returns a Map of accountId -> count.
   */
  async getAccountTransactionCountsRaw(
    accountIdsWithBoundaries: {
      accountId: string;
      startDate: number;
      afterTransactionId?: string;
      afterTransactionDate?: number;
      afterTransactionCreatedAt?: number;
    }[],
    endDate: number,
    minTransactionDate?: number,
  ): Promise<Map<string, number>> {
    if (accountIdsWithBoundaries.length === 0) return new Map();

    const results = new Map<string, number>();
    // Pre-populate with zeros for all requested accounts
    for (const b of accountIdsWithBoundaries) results.set(b.accountId, 0);

    const CHUNK_SIZE = 100; // SQLite UNION ALL limit safety buffer
    for (let i = 0; i < accountIdsWithBoundaries.length; i += CHUNK_SIZE) {
      const chunk = accountIdsWithBoundaries.slice(i, i + CHUNK_SIZE);
      const placeholders = ACTIVE_JOURNAL_STATUSES.map(() => '?').join(',');

      // 1. Build optimized SQL query with per-account boundaries using CTE
      // This avoids the massive OR clause which destroys query planner performance at scale.
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
          ${minTransactionDate !== undefined ? 'AND t.transaction_date >= ?' : ''}
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
      if (minTransactionDate !== undefined) queryParams.push(minTransactionDate);

      const raws = await this.queryRaw<{ accountId: string; count: number }>(sql, queryParams);

      if (raws !== null) {
        for (const row of raws) results.set(row.accountId, row.count);
      } else {
        // Fallback if raw query is not supported in this environment
        return this.getAccountTransactionCountsFallback(chunk, endDate, results);
      }
    }

    return results;
  }

  private async getAccountTransactionCountsFallback(
    chunk: { accountId: string; afterTransactionId?: string }[],
    endDate: number,
    results: Map<string, number>,
  ): Promise<Map<string, number>> {
    logger.warn(
      '[TransactionRawRepository] getAccountTransactionCountsRaw falling back to ORM loop.',
    );

    // Fallback for LokiJS/Test
    for (const item of chunk) {
      const q = database.collections
        .get<Transaction>('transactions')
        .query(
          Q.on('journals', 'status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
          Q.on('journals', 'deleted_at', Q.eq(null)),
          Q.where('account_id', item.accountId),
          Q.where('transaction_date', Q.lte(endDate)),
          Q.where('deleted_at', Q.eq(null)),
        );

      const txs = await q.fetch();
      let count = 0;

      const sorted = [...txs].sort((a, b) => {
        if (a.transactionDate !== b.transactionDate) return a.transactionDate - b.transactionDate;
        const aCreated = a.createdAt instanceof Date ? a.createdAt.getTime() : a.createdAt || 0;
        const bCreated = b.createdAt instanceof Date ? b.createdAt.getTime() : b.createdAt || 0;
        if (aCreated !== bCreated) return (aCreated as number) - (bCreated as number);
        return a.id.localeCompare(b.id);
      });

      const afterTransactionId = (item as any).afterTransactionId;
      let startFound = !afterTransactionId;
      for (const tx of sorted) {
        if (afterTransactionId && tx.id === afterTransactionId) {
          startFound = true;
          continue;
        }
        if (startFound) {
          count++;
        }
      }
      results.set(item.accountId, count);
    }
    return results;
  }

  /**
   * Calculates the total increases and decreases for an account within a date range.
   * Returns { totalIncrease: number, totalDecrease: number }
   */
  async getAccountPeriodMetricsRaw(
    workplaceId: string,
    accountId: string,
    startDate: number,
    endDate: number,
    isAssetOrExpense: boolean = true,
  ): Promise<{ totalIncrease: number; totalDecrease: number }> {
    const results = await this.getBulkAccountPeriodMetricsRaw(
      workplaceId,
      [{ accountId, isAssetOrExpense }],
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

  /**
   * Bulk version of getAccountPeriodMetricsRaw.
   */
  async getBulkAccountPeriodMetricsRaw(
    workplaceId: string,
    accountConfigs: { accountId: string; isAssetOrExpense: boolean }[],
    startDate: number,
    endDate: number,
  ): Promise<Map<string, { totalIncrease: number; totalDecrease: number }>> {
    if (accountConfigs.length === 0) return new Map();

    const accountIds = accountConfigs.map(c => c.accountId);
    const accountPlaceholders = accountIds.map(() => '?').join(',');
    const placeholders = ACTIVE_JOURNAL_STATUSES.map(() => '?').join(',');

    const sql = `
      SELECT 
        t.account_id as accountId,
        SUM(CASE WHEN t.transaction_type = '${TransactionType.DEBIT}' THEN t.amount ELSE 0 END) as totalDebit,
        SUM(CASE WHEN t.transaction_type = '${TransactionType.CREDIT}' THEN t.amount ELSE 0 END) as totalCredit
      FROM transactions t
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
        const configMap = new Map(accountConfigs.map(c => [c.accountId, c.isAssetOrExpense]));

        for (const row of raws) {
          const isAssetOrExpense = configMap.get(row.accountId) ?? true;
          results.set(row.accountId, {
            totalIncrease: isAssetOrExpense ? row.totalDebit : row.totalCredit,
            totalDecrease: isAssetOrExpense ? row.totalCredit : row.totalDebit,
          });
        }
      }
    } catch (error) {
      logger.error('Error in getBulkAccountPeriodMetricsRaw', error);
    }

    // Ensure all requested accounts have an entry
    for (const config of accountConfigs) {
      if (!results.has(config.accountId)) {
        results.set(config.accountId, { totalIncrease: 0, totalDecrease: 0 });
      }
    }

    return results;
  }

  /**
   * Reactive version of getAccountPeriodMetricsRaw.
   * Uses a lightweight count observer as a trigger to avoid bridge congestion.
   */
  observeAccountPeriodMetricsRaw(
    workplaceId: string,
    accountId: string,
    startDate: number,
    endDate: number,
    isAssetOrExpense: boolean = true,
  ): Observable<AccountPeriodMetrics> {
    return transactionRepository.observeActiveCount(workplaceId).pipe(
      switchMap(() =>
        from(
          this.getAccountPeriodMetricsRaw(
            workplaceId,
            accountId,
            startDate,
            endDate,
            isAssetOrExpense,
          ),
        ),
      ),
      distinctUntilChanged(
        (prev, curr) =>
          prev.totalIncrease === curr.totalIncrease && prev.totalDecrease === curr.totalDecrease,
      ),
    );
  }

  /**
   * Reactive version of getAccountDeltasGroupedRaw.
   * Emits whenever active transactions change.
   */
  observeAccountDeltasGroupedRaw(
    workplaceId: string,
    accountIds: string[],
    startDate: number,
    endDate: number,
  ): Observable<AccountDelta[]> {
    return transactionRepository
      .observeActiveCount(workplaceId)
      .pipe(
        switchMap(() =>
          from(this.getAccountDeltasGroupedRaw(workplaceId, accountIds, startDate, endDate)),
        ),
      );
  }

  /**
   * Reactive version of unreconciled metrics.
   */
  observeUnreconciledMetricsRaw(
    workplaceId: string,
    accountId: string,
    reconciledAt: number | null,
    isAssetOrExpense: boolean = true,
  ): Observable<{ count: number; total: number }> {
    const activeStatusesStr = ACTIVE_JOURNAL_STATUSES.map(s => `'${s}'`).join(',');
    const multiplierSql = isAssetOrExpense
      ? `CASE WHEN t.transaction_type = '${TransactionType.DEBIT}' THEN t.amount ELSE -t.amount END`
      : `CASE WHEN t.transaction_type = '${TransactionType.CREDIT}' THEN t.amount ELSE -t.amount END`;

    return transactionRepository.observeActiveCount(workplaceId).pipe(
      switchMap(() => {
        const sql = `
          SELECT COUNT(*) as count, SUM(${multiplierSql}) as total
          FROM transactions t
          JOIN journals j ON t.journal_id = j.id
          WHERE t.account_id = ?
            AND (t.transaction_date > ? OR ? IS NULL)
            AND t.deleted_at IS NULL
            AND j.deleted_at IS NULL
            AND j.workplace_id = ?
            AND j.status IN (${activeStatusesStr})
        `;
        return from(
          this.queryRaw<RawUnreconciledMetricsRow>(sql, [
            accountId,
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
