import { database } from '@/src/data/database/Database';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { effect, periodFlowSQL } from '@/src/utils/accounting/BalanceEffects';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';
import { Q } from '@nozbe/watermelondb';
import dayjs from 'dayjs';
import Account from '../../models/Account';
import Transaction from '../../models/Transaction';
import { AccountTransactionBoundary, DailyDelta } from '../TransactionTypes';
import { rawSqlExecutor } from './RawSqlExecutor';

interface RawDailyDeltaRow extends DailyDelta {
  dayStartStr: string;
}

export class TransactionRawMetricsQueries {
  async getLatestBalancesAndCounts(
    workplaceId: WorkplaceId,
    accountBoundaries: readonly AccountTransactionBoundary[],
    endDate: number,
  ): Promise<{ balances: Map<string, number>; counts: Map<string, number> }> {
    const [balances, counts] = await Promise.all([
      this.getLatestBalancesRaw(
        workplaceId,
        accountBoundaries.map(boundary => boundary.accountId),
        endDate,
      ),
      this.getAccountTransactionCounts(workplaceId, accountBoundaries, endDate),
    ]);
    return { balances, counts };
  }

  /** Count active journal legs after each account's own snapshot cursor. */
  async getAccountTransactionCounts(
    workplaceId: WorkplaceId,
    accountBoundaries: readonly AccountTransactionBoundary[],
    endDate: number,
  ): Promise<Map<string, number>> {
    if (accountBoundaries.length === 0) return new Map();

    const results = new Map<string, number>(
      accountBoundaries.map(({ accountId }) => [accountId, 0]),
    );
    for (let index = 0; index < accountBoundaries.length; index += 100) {
      const chunk = accountBoundaries.slice(index, index + 100);
      const statusPlaceholders = ACTIVE_JOURNAL_STATUSES.map(() => '?').join(',');
      const values: (string | number)[] = [];
      const boundaryRows = chunk.map(boundary => {
        values.push(
          boundary.accountId,
          boundary.afterTransactionDate ?? 0,
          boundary.afterTransactionCreatedAt ?? 0,
          boundary.afterTransactionId ?? '',
        );
        return 'SELECT ? as acc_id, ? as last_date, ? as last_created, ? as last_id';
      });
      const sql = `
        WITH search_boundaries(acc_id, last_date, last_created, last_id) AS (
          ${boundaryRows.join(' UNION ALL ')}
        )
        SELECT t.account_id as accountId, COUNT(*) as count
        FROM transactions t
        JOIN journals j ON t.journal_id = j.id
        JOIN search_boundaries b ON t.account_id = b.acc_id
        WHERE t.workplace_id = ?
          AND j.workplace_id = ?
          AND t.deleted_at IS NULL
          AND j.deleted_at IS NULL
          AND j.status IN (${statusPlaceholders})
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
      const rows = await rawSqlExecutor.query<{ accountId: AccountId; count: number }>(sql, [
        ...values,
        workplaceId,
        workplaceId,
        ...ACTIVE_JOURNAL_STATUSES,
        endDate,
      ]);
      if (rows !== null) {
        for (const row of rows) results.set(row.accountId, row.count);
        continue;
      }

      const boundariesByAccount = new Map(chunk.map(boundary => [boundary.accountId, boundary]));
      const minimumDate = Math.min(...chunk.map(boundary => boundary.afterTransactionDate ?? 0));
      const transactions = await database.collections
        .get<Transaction>('transactions')
        .query(
          Q.where('workplace_id', workplaceId),
          Q.on('journals', 'workplace_id', Q.eq(workplaceId)),
          Q.on('journals', 'status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
          Q.on('journals', 'deleted_at', Q.eq(null)),
          Q.where('account_id', Q.oneOf(chunk.map(boundary => boundary.accountId))),
          Q.where('transaction_date', Q.gte(minimumDate)),
          Q.where('transaction_date', Q.lte(endDate)),
          Q.where('deleted_at', Q.eq(null)),
        )
        .fetch();

      for (const transaction of transactions) {
        const boundary = boundariesByAccount.get(transaction.accountId);
        if (!boundary) continue;
        const lastDate = boundary.afterTransactionDate ?? 0;
        const lastCreatedAt = boundary.afterTransactionCreatedAt ?? 0;
        const lastId = boundary.afterTransactionId ?? '';
        const createdAt = transaction.createdAt.getTime();
        const isAfterCursor =
          lastId === '' ||
          transaction.transactionDate > lastDate ||
          (transaction.transactionDate === lastDate && createdAt > lastCreatedAt) ||
          (transaction.transactionDate === lastDate &&
            createdAt === lastCreatedAt &&
            transaction.id > lastId);
        if (transaction.transactionDate >= lastDate && isAfterCursor) {
          results.set(transaction.accountId, (results.get(transaction.accountId) ?? 0) + 1);
        }
      }
    }
    return results;
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
        JOIN accounts a ON t.account_id = a.id
        JOIN journals j ON t.journal_id = j.id
        WHERE t.account_id IN (${accountPlaceholders})
          AND t.transaction_date <= ?
          AND t.deleted_at IS NULL
          AND t.workplace_id = ?
          AND a.workplace_id = ?
          AND j.workplace_id = ?
          AND j.deleted_at IS NULL
          AND j.status IN (${placeholders})
      )
      SELECT accountId, runningBalance
      FROM RankedTransactions
      WHERE rn = 1
    `;

    const raws = await rawSqlExecutor.query<{ accountId: AccountId; runningBalance: number }>(sql, [
      ...accountIds,
      cutoffDate,
      workplaceId,
      workplaceId,
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
          Q.where('workplace_id', workplaceId),
          Q.on('accounts', 'workplace_id', Q.eq(workplaceId)),
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
        AND t.workplace_id = ?
        AND a.workplace_id = ?
        AND j.deleted_at IS NULL
        AND j.workplace_id = ?
        AND j.status IN (${placeholders})
      GROUP BY dayStartStr, t.currency_code, a.account_type
      ORDER BY dayStartStr ASC
    `;

    const raws = await rawSqlExecutor.query<RawDailyDeltaRow>(sql, [
      ...accountIds,
      startDate,
      endDate,
      workplaceId,
      workplaceId,
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
        .query(Q.where('id', Q.oneOf(accountIds)), Q.where('workplace_id', workplaceId))
        .fetch(),
      database.collections
        .get<Transaction>('transactions')
        .query(
          Q.where('workplace_id', workplaceId),
          Q.on('accounts', 'workplace_id', Q.eq(workplaceId)),
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
}

export const transactionRawMetricsQueries = new TransactionRawMetricsQueries();
