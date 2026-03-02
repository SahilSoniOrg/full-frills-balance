import { database } from '@/src/data/database/Database';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';
import { logger } from '@/src/utils/logger';
import { Q } from '@nozbe/watermelondb';
import { getRawAdapter } from '../database/DatabaseUtils';
import Account from '../models/Account';
import Transaction, { TransactionType } from '../models/Transaction';
import {
  AccountDelta,
  DailyDelta,
  RebuildTransaction,
  RecurringPattern
} from './TransactionTypes';

/**
 * Specialized repository for high-performance raw SQL queries on transactions.
 * Bypasses the WatermelonDB bridge/ORM layers for bulk data operations.
 */
class TransactionRawRepository {
  private snakeToCamel(value: string): string {
    return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
  }

  private getSignedDelta(accountType: string, transactionType: string, amount: number): number {
    const isDebitNormal = accountType === 'ASSET' || accountType === 'EXPENSE';
    if (isDebitNormal) {
      return transactionType === TransactionType.DEBIT ? amount : -amount;
    }
    return transactionType === TransactionType.CREDIT ? amount : -amount;
  }

  /**
   * Universal raw query helper for consolidated SQL aliasing.
   */
  async queryRaw<T>(sql: string, args: (string | number)[] = []): Promise<T[]> {
    const sqlAdapter = getRawAdapter(database);
    if (!sqlAdapter || typeof sqlAdapter.queryRaw !== 'function') return [];

    try {
      const result = await sqlAdapter.queryRaw(sql, args);
      const rawRows = Array.isArray(result) ? result : (result?.rows || []);

      // Normalize keys to camelCase if needed (some adapters return lowercase or uppercase)
      return rawRows.map((row: any) => {
        const normalized: any = {};
        for (const key of Object.keys(row)) {
          const lowerKey = key.toLowerCase();
          const snakeLowerKey = lowerKey.includes('_') ? lowerKey : lowerKey.replace(/([a-z])([A-Z])/g, '$1_$2');
          const camelKey = this.snakeToCamel(snakeLowerKey);

          // Preserve original adapter key and add predictable normalized variants.
          normalized[key] = row[key];
          normalized[camelKey] = row[key];

          // 1. Direct lowercase mapping (covers most fields like 'id', 'amount', 'total', 'delta')
          normalized[lowerKey] = row[key];

          // 2. Explicit camelCase mapping for model-matching fields
          if (lowerKey === 'transaction_type' || lowerKey === 'transactiontype') normalized.transactionType = row[key];
          else if (lowerKey === 'transaction_date' || lowerKey === 'transactiondate') normalized.transactionDate = row[key];
          else if (lowerKey === 'running_balance' || lowerKey === 'runningbalance') normalized.runningBalance = row[key];
          else if (lowerKey === 'currency_code' || lowerKey === 'currencycode') normalized.currencyCode = row[key];
          else if (lowerKey === 'account_id' || lowerKey === 'accountid') normalized.accountId = row[key];
          else if (lowerKey === 'journal_id' || lowerKey === 'journalid') normalized.journalId = row[key];
          else if (lowerKey === 'created_at' || lowerKey === 'createdat') normalized.createdAt = row[key];
          else if (lowerKey === 'updated_at' || lowerKey === 'updatedat') normalized.updatedAt = row[key];
          else if (lowerKey === 'account_type' || lowerKey === 'accounttype') normalized.accountType = row[key];
          else if (lowerKey === 'account_subtype' || lowerKey === 'accountsubtype') normalized.accountSubtype = row[key];
          else if (lowerKey === 'parent_account_id' || lowerKey === 'parentaccountid') normalized.parentAccountId = row[key];
          else if (lowerKey === 'daystart') normalized.dayStart = row[key];
          else if (lowerKey === 'journalids') normalized.journalIds = row[key];
          else if (lowerKey === 'occurrencecount') normalized.occurrenceCount = row[key];
          else if (lowerKey === 'firstdate') normalized.firstDate = row[key];
          else if (lowerKey === 'lastdate') normalized.lastDate = row[key];
        }
        return normalized as T;
      });
    } catch (error) {
      logger.error(`[TransactionRawRepository] queryRaw failed`, { sql: sql.substring(0, 500), error });
      return [];
    }
  }

  /**
   * Fetches the latest running balance for multiple accounts in a single pass.
   * Returns a Map of accountId -> latest runningBalance.
   */
  async getLatestBalancesRaw(accountIds: string[], cutoffDate: number = Date.now()): Promise<Map<string, number>> {
    if (accountIds.length === 0) return new Map();

    const placeholders = accountIds.map(() => '?').join(',');
    const activeStatusesStr = ACTIVE_JOURNAL_STATUSES.map(s => `'${s}'`).join(',');

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
        WHERE t.account_id IN (${placeholders})
          AND t.transaction_date <= ?
          AND t.deleted_at IS NULL
          AND j.deleted_at IS NULL
          AND j.status IN (${activeStatusesStr})
      )
      SELECT accountId, runningBalance
      FROM RankedTransactions
      WHERE rn = 1
    `;

    const raws = await this.queryRaw<{ accountId: string; runningBalance: number }>(
      sql,
      [...accountIds, cutoffDate]
    );

    if (raws.length > 0) {
      return new Map(raws.map(r => [r.accountId, r.runningBalance]));
    }

    // Fallback for LokiJS/Test
    const results = new Map<string, number>();
    for (const accountId of accountIds) {
      const txs = await database.collections.get<Transaction>('transactions')
        .query(
          Q.on('journals', 'status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
          Q.on('journals', 'deleted_at', Q.eq(null)),
          Q.where('account_id', accountId),
          Q.where('transaction_date', Q.lte(cutoffDate)),
          Q.where('deleted_at', Q.eq(null)),
          Q.sortBy('transaction_date', Q.desc),
          Q.sortBy('created_at', Q.desc),
          Q.take(1)
        ).fetch();
      results.set(accountId, txs[0]?.runningBalance || 0);
    }
    return results;
  }

  /**
   * Fetches the total SUM of transaction amounts for an account as of a date.
   * Used for balance verification and recomputation.
   */
  async getAccountSumRaw(accountId: string, cutoffDate: number, isAssetOrExpense: boolean = true, limitTransactionId?: string): Promise<number> {
    const multiplierSql = isAssetOrExpense
      ? `CASE WHEN t.transaction_type = '${TransactionType.DEBIT}' THEN t.amount ELSE -t.amount END`
      : `CASE WHEN t.transaction_type = '${TransactionType.CREDIT}' THEN t.amount ELSE -t.amount END`;

    const activeStatusesStr = ACTIVE_JOURNAL_STATUSES.map(s => `'${s}'`).join(',');

    let sql = `
      SELECT SUM(${multiplierSql}) as total
      FROM transactions t
      JOIN journals j ON t.journal_id = j.id
      WHERE t.account_id = ?
        AND t.transaction_date <= ?
        AND t.deleted_at IS NULL
        AND j.deleted_at IS NULL
        AND j.status IN (${activeStatusesStr})
    `;
    const args = [accountId, cutoffDate];

    if (limitTransactionId) {
      // Include everything strictly chronologically before this transaction (H-6 fix)
      sql += ` AND (t.transaction_date < (SELECT transaction_date FROM transactions WHERE id = ?)
                OR (t.transaction_date = (SELECT transaction_date FROM transactions WHERE id = ?) 
                    AND t.created_at <= (SELECT created_at FROM transactions WHERE id = ?)))`;
      args.push(limitTransactionId, limitTransactionId, limitTransactionId);
    }

    const raws = await this.queryRaw<{ total: number }>(sql, args);
    if (raws.length > 0) return raws[0]?.total || 0;

    // Fallback for LokiJS/Test
    const txs = await database.collections.get<Transaction>('transactions')
      .query(
        Q.on('journals', 'status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
        Q.on('journals', 'deleted_at', Q.eq(null)),
        Q.where('account_id', accountId),
        Q.where('transaction_date', Q.lte(cutoffDate)),
        Q.where('deleted_at', Q.eq(null)),
        Q.sortBy('transaction_date', Q.desc),
        Q.sortBy('created_at', Q.desc),
        Q.take(1)
      ).fetch();

    return txs[0]?.runningBalance || 0;
  }

  /**
   * Fetches daily net balance changes grouped by day, currency, and account type.
   * Optimized for bulk currency conversion in wealth history.
   */
  async getDailyDeltasGroupedRaw(
    accountIds: string[],
    startDate: number,
    endDate: number
  ): Promise<DailyDelta[]> {
    if (accountIds.length === 0) return [];

    const placeholders = accountIds.map(() => '?').join(',');
    const activeStatusesStr = ACTIVE_JOURNAL_STATUSES.map(s => `'${s}'`).join(',');

    const sql = `
      SELECT
        (CAST(t.transaction_date / 86400000 AS INTEGER) * 86400000) AS dayStart,
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
      WHERE t.account_id IN (${placeholders})
        AND t.transaction_date >= ?
        AND t.transaction_date <= ?
        AND t.deleted_at IS NULL
        AND j.deleted_at IS NULL
        AND j.status IN (${activeStatusesStr})
      GROUP BY dayStart, t.currency_code, a.account_type
      ORDER BY dayStart ASC
    `;

    const raws = await this.queryRaw<DailyDelta>(sql, [...accountIds, startDate, endDate]);
    if (raws.length > 0) return raws;

    // Fallback for LokiJS/Test
    const [accounts, txs] = await Promise.all([
      database.collections.get<Account>('accounts')
        .query(Q.where('id', Q.oneOf(accountIds)))
        .fetch(),
      database.collections.get<Transaction>('transactions')
        .query(
          Q.on('journals', 'status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
          Q.on('journals', 'deleted_at', Q.eq(null)),
          Q.where('account_id', Q.oneOf(accountIds)),
          Q.where('transaction_date', Q.gte(startDate)),
          Q.where('transaction_date', Q.lte(endDate)),
          Q.where('deleted_at', Q.eq(null))
        )
        .fetch()
    ]);

    const accountTypeById = new Map(accounts.map((a) => [a.id, a.accountType]));
    const grouped = new Map<string, DailyDelta>();

    for (const tx of txs) {
      const accountType = accountTypeById.get(tx.accountId);
      if (!accountType) continue;

      const dayStart = Math.floor(tx.transactionDate / 86400000) * 86400000;
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
    accountIds: string[],
    startDate: number,
    endDate: number
  ): Promise<AccountDelta[]> {
    if (accountIds.length === 0) return [];

    const placeholders = accountIds.map(() => '?').join(',');
    const activeStatusesStr = ACTIVE_JOURNAL_STATUSES.map(s => `'${s}'`).join(',');

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
      WHERE t.account_id IN (${placeholders})
        AND t.transaction_date >= ?
        AND t.transaction_date <= ?
        AND t.deleted_at IS NULL
        AND j.deleted_at IS NULL
        AND j.status IN (${activeStatusesStr})
      GROUP BY t.account_id, t.currency_code
    `;

    const raws = await this.queryRaw<AccountDelta>(sql, [...accountIds, startDate, endDate]);
    if (raws.length > 0) return raws;

    // Fallback for LokiJS/Test
    const [accounts, txs] = await Promise.all([
      database.collections.get<Account>('accounts')
        .query(Q.where('id', Q.oneOf(accountIds)))
        .fetch(),
      database.collections.get<Transaction>('transactions')
        .query(
          Q.on('journals', 'status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
          Q.on('journals', 'deleted_at', Q.eq(null)),
          Q.where('account_id', Q.oneOf(accountIds)),
          Q.where('transaction_date', Q.gte(startDate)),
          Q.where('transaction_date', Q.lte(endDate)),
          Q.where('deleted_at', Q.eq(null))
        )
        .fetch()
    ]);

    const accountTypeById = new Map(accounts.map((a) => [a.id, a.accountType]));
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
    const activeStatusesStr = ACTIVE_JOURNAL_STATUSES.map(s => `'${s}'`).join(',');

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
        AND j.status IN (${activeStatusesStr})
      ORDER BY t.transaction_date ASC, t.created_at ASC
    `;

    const raws = await this.queryRaw<RebuildTransaction>(sql, [accountId, startDate]);
    if (raws.length > 0) return raws;

    // Fallback for LokiJS/Test
    const txs = await database.collections.get<Transaction>('transactions')
      .query(
        Q.on('journals', 'status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
        Q.on('journals', 'deleted_at', Q.eq(null)),
        Q.where('account_id', accountId),
        Q.where('transaction_date', Q.gte(startDate)),
        Q.where('deleted_at', Q.eq(null)),
        Q.sortBy('transaction_date', Q.asc),
        Q.sortBy('created_at', Q.asc)
      ).fetch();

    return txs.map((tx: Transaction) => ({
      id: tx.id,
      amount: tx.amount,
      transactionType: tx.transactionType,
      transactionDate: tx.transactionDate,
      runningBalance: tx.runningBalance ?? null,
      createdAt: tx.createdAt.getTime()
    }));
  }

  /**
   * Finds potential recurring transactions by grouping by amount and account.
   */
  async getRecurringPatternsRaw(startDate: number, minCount: number): Promise<RecurringPattern[]> {
    const activeStatusesStr = ACTIVE_JOURNAL_STATUSES.map(s => `'${s}'`).join(',');

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
        AND j.status IN (${activeStatusesStr})
      GROUP BY t.amount, t.account_id, t.currency_code
      HAVING occurrenceCount >= ?
      ORDER BY occurrenceCount DESC
    `;

    const raws = await this.queryRaw<RecurringPattern>(sql, [startDate, minCount]);
    if (raws.length > 0) return raws;

    // Fallback for LokiJS/Test
    const txs = await database.collections.get<Transaction>('transactions')
      .query(
        Q.on('journals', 'status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
        Q.on('journals', 'deleted_at', Q.eq(null)),
        Q.where('transaction_date', Q.gte(startDate)),
        Q.where('deleted_at', Q.eq(null))
      )
      .fetch();

    const grouped = new Map<string, {
      amount: number;
      accountId: string;
      currencyCode: string;
      occurrenceCount: number;
      journalIds: Set<string>;
      firstDate: number;
      lastDate: number;
    }>();

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
          lastDate: tx.transactionDate
        });
      }
    }

    return Array.from(grouped.values())
      .filter((g) => g.occurrenceCount >= minCount)
      .sort((a, b) => b.occurrenceCount - a.occurrenceCount)
      .map((g) => ({
        amount: g.amount,
        accountId: g.accountId,
        currencyCode: g.currencyCode,
        occurrenceCount: g.occurrenceCount,
        journalIds: Array.from(g.journalIds).join(','),
        firstDate: g.firstDate,
        lastDate: g.lastDate
      }));
  }

  /**
   * Fetches transaction counts for multiple accounts between two dates.
   * Returns a Map of accountId -> count.
   */
  async getAccountTransactionCountsRaw(
    accountIdsWithStartDates: { accountId: string; startDate: number }[],
    endDate: number
  ): Promise<Map<string, number>> {
    if (accountIdsWithStartDates.length === 0) return new Map();
    const activeStatusesStr = ACTIVE_JOURNAL_STATUSES.map(s => `'${s}'`).join(',');

    // To prevent O(N) UNION ALL growth, we can select all transactions for these accounts
    // up to the endDate, and then group by account_id in SQLite. 
    // Since each account has a different startDate, we handle that in JS or use 
    // conditional aggregation if we can. 
    // Wait, since SQLite doesn't have an easy array binding for complex tuples,
    // and passing N separate start dates into SQL is complex without UNION ALL,
    // simpler approach: filter by the MIN(startDate) globally, then group by, 
    // and filter in JS if needed. Or construct a simpler CASE statement.
    // Actually, generating a CASE statement for the dates is better than UNION ALL
    // because it keeps the query plan as a single scan over the relevant accounts.

    const accountIds = accountIdsWithStartDates.map(a => a.accountId);
    const placeholders = accountIds.map(() => '?').join(',');

    // Create a CASE statement to check start dates per account
    const caseClauses = accountIdsWithStartDates.map(() => `WHEN ? THEN t.transaction_date > ?`).join(' ');

    // We pass account ID, start date for each CASE branch
    const caseParams: (string | number)[] = [];
    accountIdsWithStartDates.forEach(item => {
      caseParams.push(item.accountId, item.startDate);
    });

    const sql = `
      SELECT t.account_id, COUNT(*) as tx_count 
      FROM transactions t
      JOIN journals j ON t.journal_id = j.id
      WHERE t.account_id IN (${placeholders})
        AND t.transaction_date <= ?
        AND (
          CASE t.account_id 
            ${caseClauses}
            ELSE 0
          END
        )
        AND t.deleted_at IS NULL
        AND j.deleted_at IS NULL
        AND j.status IN (${activeStatusesStr})
      GROUP BY t.account_id
    `;

    const params = [
      ...accountIds,
      endDate,
      ...caseParams
    ];

    const raws = await this.queryRaw<{ account_id: string; tx_count: number }>(sql, params);
    if (raws.length > 0) {
      return new Map(raws.map(r => [r.account_id, r.tx_count || 0]));
    }

    // Fallback for LokiJS/Test
    const results = new Map<string, number>();
    for (const item of accountIdsWithStartDates) {
      const count = await database.collections.get<Transaction>('transactions')
        .query(
          Q.on('journals', 'status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
          Q.on('journals', 'deleted_at', Q.eq(null)),
          Q.where('account_id', item.accountId),
          Q.where('transaction_date', Q.gt(item.startDate)),
          Q.where('transaction_date', Q.lte(endDate)),
          Q.where('deleted_at', Q.eq(null))
        ).fetchCount();
      results.set(item.accountId, count);
    }
    return results;
  }
}

export const transactionRawRepository = new TransactionRawRepository();
