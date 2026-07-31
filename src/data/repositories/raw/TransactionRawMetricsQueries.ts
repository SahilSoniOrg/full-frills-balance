import { database } from '@/src/data/database/Database';
import { AccountId, WorkplaceId } from '@/src/types/domain';
import { effect, periodFlowSQL } from '@/src/services/accounting/BalanceEffects';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';
import { logger } from '@/src/utils/logger';
import { Q } from '@nozbe/watermelondb';
import dayjs from 'dayjs';
import { getRawAdapter } from '../../database/DatabaseUtils';
import Account from '../../models/Account';
import Transaction from '../../models/Transaction';
import { AccountDelta, DailyDelta, RawSQLArg } from '../TransactionTypes';

export interface AccountPeriodMetrics {
  totalIncrease: number;
  totalDecrease: number;
}

export interface RawPeriodMetricsRow {
  accountId: AccountId;
  totalDebit: number;
  totalCredit: number;
}

export interface RawUnreconciledMetricsRow {
  count: number;
  total: number | null;
}

interface RawDailyDeltaRow extends DailyDelta {
  dayStartStr: string;
}

export class TransactionRawMetricsQueries {
  private keyCache: Map<string, string> = new Map();
  private mappingCache: Map<string, { original: string; camel: string }[]> = new Map();

  private toCamelCase(str: string): string {
    const cached = this.keyCache.get(str);
    if (cached) return cached;
    const result = str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    this.keyCache.set(str, result);
    return result;
  }

  async queryRaw<T>(sql: string, args: RawSQLArg[] = [], table?: string): Promise<T[] | null> {
    const sqlAdapter = getRawAdapter(database);
    if (!sqlAdapter || typeof sqlAdapter.queryRaw !== 'function') return null;

    try {
      const result = await sqlAdapter.queryRaw(sql, args, table);
      const rawRows = Array.isArray(result) ? result : result?.rows || [];
      if (rawRows.length === 0) return [];

      const sampleRow = rawRows[0];
      const keys = Object.keys(sampleRow);
      const schemaSignature = keys.join('|');

      let mapping = this.mappingCache.get(schemaSignature);
      if (!mapping) {
        mapping = keys.map(key => {
          const lower = key.toLowerCase();
          return { original: key, camel: this.toCamelCase(lower) };
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
          if (m.original !== m.camel) normalized[m.camel] = val;
        }
        resultRows[r] = normalized as T;
      }
      return resultRows;
    } catch (error) {
      logger.error('[TransactionRawMetricsQueries] queryRaw failed', { error });
      throw error;
    }
  }

  async getLatestBalancesRaw(
    workplaceId: WorkplaceId,
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

    const raws = await this.queryRaw<{ accountId: AccountId; runningBalance: number }>(sql, [
      ...accountIds,
      cutoffDate,
      workplaceId,
      ...ACTIVE_JOURNAL_STATUSES,
    ]);

    if (raws !== null) {
      return new Map(raws.map(r => [r.accountId, r.runningBalance]));
    }

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

  async getDailyDeltasGroupedRaw(
    workplaceId: WorkplaceId,
    accountIds: string[],
    startDate: number,
    endDate: number,
  ): Promise<DailyDelta[]> {
    if (accountIds.length === 0) return [];

    const accountPlaceholders = accountIds.map(() => '?').join(',');
    const placeholders = ACTIVE_JOURNAL_STATUSES.map(() => '?').join(',');

    const { increaseCase, decreaseCase } = periodFlowSQL();
    const sql = `
      SELECT
        strftime('%Y-%m-%d', t.transaction_date / 1000, 'unixepoch', 'localtime') AS dayStartStr,
        t.currency_code AS currencyCode,
        a.account_type AS accountType,
        SUM(${increaseCase}) - SUM(${decreaseCase}) AS delta
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

    const raws = await this.queryRaw<RawDailyDeltaRow>(sql, [
      ...accountIds,
      startDate,
      endDate,
      workplaceId,
      ...ACTIVE_JOURNAL_STATUSES,
    ]);

    if (raws !== null) {
      return raws.map(r => ({
        ...r,
        dayStart: new Date(r.dayStartStr + 'T00:00:00').getTime(),
      }));
    }

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
      const delta = effect(accountType, tx.transactionType).delta(tx.amount);
      const existing = grouped.get(key);

      if (existing) {
        existing.delta += delta;
      } else {
        grouped.set(key, { dayStart, currencyCode: tx.currencyCode, accountType, delta });
      }
    }

    return Array.from(grouped.values()).sort((a, b) => a.dayStart - b.dayStart);
  }

  async getAccountDeltasGroupedRaw(
    workplaceId: WorkplaceId,
    accountIds: string[],
    startDate: number,
    endDate: number,
  ): Promise<AccountDelta[]> {
    if (accountIds.length === 0) return [];

    const accountPlaceholders = accountIds.map(() => '?').join(',');
    const placeholders = ACTIVE_JOURNAL_STATUSES.map(() => '?').join(',');

    const { increaseCase, decreaseCase } = periodFlowSQL();
    const sql = `
      SELECT
        t.account_id AS accountId,
        t.currency_code AS currencyCode,
        SUM(${increaseCase}) - SUM(${decreaseCase}) AS delta
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

    if (raws !== null) return raws;

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
      const delta = effect(accountType, tx.transactionType).delta(tx.amount);
      const existing = grouped.get(key);

      if (existing) {
        existing.delta += delta;
      } else {
        grouped.set(key, { accountId: tx.accountId, currencyCode: tx.currencyCode, delta });
      }
    }

    return Array.from(grouped.values());
  }
}

export const transactionRawMetricsQueries = new TransactionRawMetricsQueries();
