import { database } from '@/src/data/database/Database';
import { AccountId, TransactionId, WorkplaceId } from '@/src/types/domain';
import { getAccountBalanceDelta } from '@/src/utils/accountingHelpers';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';
import { Q } from '@nozbe/watermelondb';
import { AccountType } from '../../models/Account';
import Transaction, { TransactionType } from '../../models/Transaction';
import { RawSQLArg, RebuildTransaction } from '../TransactionTypes';
import { transactionRawMetricsQueries } from './TransactionRawMetricsQueries';

export class TransactionRawRebuildQueries {
  async getAccountSumRaw(
    workplaceId: WorkplaceId,
    accountId: AccountId,
    cutoffDate: number,
    isAssetOrExpense: boolean = true,
    upToTransactionId?: TransactionId,
    afterTransactionId?: TransactionId,
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

    const raws = await transactionRawMetricsQueries.queryRaw<{ total: number }>(sql, args);
    if (raws !== null) return raws[0]?.total || 0;

    const filterClauses: Q.Clause[] = [
      Q.on('journals', 'status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
      Q.on('journals', 'deleted_at', Q.eq(null)),
      Q.on('journals', 'workplace_id', Q.eq(workplaceId)),
      Q.where('account_id', accountId),
      Q.where('transaction_date', Q.lte(cutoffDate)),
      Q.where('deleted_at', Q.eq(null)),
    ];

    if (upToTransactionId || afterTransactionId) {
      const txs = await database.collections
        .get<Transaction>('transactions')
        .query(...filterClauses)
        .fetch();

      let sum = 0;
      let startFound = !afterTransactionId;
      let endReached = false;

      const sortedTxs = [...txs].sort((a, b) => {
        if (a.transactionDate !== b.transactionDate) return a.transactionDate - b.transactionDate;
        const aCreated = a.createdAt instanceof Date ? a.createdAt.getTime() : a.createdAt || 0;
        const bCreated = b.createdAt instanceof Date ? b.createdAt.getTime() : b.createdAt || 0;
        if (aCreated !== bCreated) return (aCreated as number) - (bCreated as number);
        if (afterTransactionId && a.id === afterTransactionId) return -1;
        if (afterTransactionId && b.id === afterTransactionId) return 1;
        return a.id.localeCompare(b.id);
      });

      for (const tx of sortedTxs) {
        if (endReached) break;
        if (afterTransactionId && tx.id === afterTransactionId) {
          startFound = true;
          continue;
        }
        if (startFound) {
          sum += getAccountBalanceDelta(
            tx.amount,
            isAssetOrExpense ? AccountType.ASSET : AccountType.LIABILITY,
            tx.transactionType,
          );
        }
        if (upToTransactionId && tx.id === upToTransactionId) {
          endReached = true;
        }
      }
      return sum;
    }

    const txs = await database.collections
      .get<Transaction>('transactions')
      .query(...filterClauses)
      .fetch();
    return txs.reduce(
      (acc, tx) =>
        acc +
        getAccountBalanceDelta(
          tx.amount,
          isAssetOrExpense ? AccountType.ASSET : AccountType.LIABILITY,
          tx.transactionType,
        ),
      0,
    );
  }

  async getRebuildDataRaw(accountId: AccountId, startDate: number): Promise<RebuildTransaction[]> {
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

    const raws = await transactionRawMetricsQueries.queryRaw<RebuildTransaction>(sql, [
      accountId,
      startDate,
      ...ACTIVE_JOURNAL_STATUSES,
    ]);
    if (raws !== null) return raws;

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
}

export const transactionRawRebuildQueries = new TransactionRawRebuildQueries();
