import { database } from '@/src/data/database/Database';
import { AccountId, TransactionId, WorkplaceId } from '@/src/types/ids';
import { AccountType, TransactionType } from '@/src/types/enums';
import { effect } from '@/src/utils/accounting/BalanceEffects';
import {
  ACTIVE_JOURNAL_STATUSES,
  activeJournalStatusSqlPlaceholders,
} from '@/src/utils/journalStatus';
import { activeJournalLegClauses } from '../transaction/transactionActiveClauses';
import { Q } from '@nozbe/watermelondb';
import Transaction from '../../models/Transaction';
import type { RawSqlArg } from '@/src/data/database/DatabaseUtils';
import { RebuildTransaction } from '../TransactionTypes';
import { rawSqlExecutor } from './RawSqlExecutor';

const CURSOR_TRANSACTION_DATE_SQL = `SELECT cursor_t.transaction_date
      FROM transactions cursor_t
      JOIN journals cursor_j ON cursor_t.journal_id = cursor_j.id
      WHERE cursor_t.id = ?
        AND cursor_t.workplace_id = ?
        AND cursor_j.workplace_id = ?`;
const CURSOR_TRANSACTION_CREATED_AT_SQL = `SELECT cursor_t.created_at
      FROM transactions cursor_t
      JOIN journals cursor_j ON cursor_t.journal_id = cursor_j.id
      WHERE cursor_t.id = ?
        AND cursor_t.workplace_id = ?
        AND cursor_j.workplace_id = ?`;

function cursorComparisonSql(
  mode: 'upTo' | 'after',
  dateSql: string,
  createdAtSql: string,
): string {
  if (mode === 'upTo') {
    return `AND (t.transaction_date < (${dateSql})
                OR (t.transaction_date = (${dateSql})
                    AND t.created_at < (${createdAtSql}))
                OR (t.transaction_date = (${dateSql})
                    AND t.created_at = (${createdAtSql})
                    AND t.id <= ?))`;
  }
  return `AND (t.transaction_date > (${dateSql})
                OR (t.transaction_date = (${dateSql})
                    AND t.created_at > (${createdAtSql}))
                OR (t.transaction_date = (${dateSql})
                    AND t.created_at = (${createdAtSql})
                    AND t.id > ?))`;
}

export class TransactionRawRebuildQueries {
  async getAccountSumRaw(
    workplaceId: WorkplaceId,
    accountId: AccountId,
    cutoffDate: number,
    accountType: AccountType,
    upToTransactionId?: TransactionId,
    afterTransactionId?: TransactionId,
  ): Promise<number> {
    const multiplierSql = [AccountType.ASSET, AccountType.EXPENSE].includes(accountType)
      ? `CASE WHEN t.transaction_type = '${TransactionType.DEBIT}' THEN t.amount ELSE -t.amount END`
      : `CASE WHEN t.transaction_type = '${TransactionType.CREDIT}' THEN t.amount ELSE -t.amount END`;

    const placeholders = activeJournalStatusSqlPlaceholders();

    const sql = `
      SELECT SUM(${multiplierSql}) as total
      FROM transactions t
      JOIN journals j ON t.journal_id = j.id
      WHERE t.account_id = ?
        AND t.transaction_date <= ?
        AND t.workplace_id = ?
        AND t.deleted_at IS NULL
        AND j.workplace_id = ?
        AND j.deleted_at IS NULL
        AND j.status IN (${placeholders})
        ${upToTransactionId ? cursorComparisonSql('upTo', CURSOR_TRANSACTION_DATE_SQL, CURSOR_TRANSACTION_CREATED_AT_SQL) : ''}
        ${afterTransactionId ? cursorComparisonSql('after', CURSOR_TRANSACTION_DATE_SQL, CURSOR_TRANSACTION_CREATED_AT_SQL) : ''}
    `;
    const args: RawSqlArg[] = [
      accountId,
      cutoffDate,
      workplaceId,
      workplaceId,
      ...ACTIVE_JOURNAL_STATUSES,
    ];
    const addCursorArgs = (transactionId: TransactionId) => {
      for (let index = 0; index < 5; index += 1) {
        args.push(transactionId, workplaceId, workplaceId);
      }
      args.push(transactionId);
    };
    if (upToTransactionId) {
      addCursorArgs(upToTransactionId);
    }
    if (afterTransactionId) {
      addCursorArgs(afterTransactionId);
    }

    const raws = await rawSqlExecutor.query<{ total: number }>(sql, args);
    if (raws !== null) return raws[0]?.total || 0;

    const filterClauses: Q.Clause[] = [
      ...activeJournalLegClauses(workplaceId),
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
          sum += effect(accountType, tx.transactionType).delta(tx.amount);
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
      (acc, tx) => acc + effect(accountType, tx.transactionType).delta(tx.amount),
      0,
    );
  }

  async getRebuildDataRaw(
    workplaceId: WorkplaceId,
    accountId: AccountId,
    startDate: number,
  ): Promise<RebuildTransaction[]> {
    const placeholders = activeJournalStatusSqlPlaceholders();

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
        AND t.workplace_id = ?
        AND j.workplace_id = ?
        AND t.deleted_at IS NULL
        AND j.deleted_at IS NULL
        AND j.status IN (${placeholders})
      ORDER BY t.transaction_date ASC, t.created_at ASC, t.id ASC
    `;

    const raws = await rawSqlExecutor.query<RebuildTransaction>(sql, [
      accountId,
      startDate,
      workplaceId,
      workplaceId,
      ...ACTIVE_JOURNAL_STATUSES,
    ]);
    if (raws !== null) return raws;

    const txs = await database.collections
      .get<Transaction>('transactions')
      .query(
        ...activeJournalLegClauses(workplaceId),
        Q.where('account_id', accountId),
        Q.where('transaction_date', Q.gte(startDate)),
        Q.where('deleted_at', Q.eq(null)),
        Q.sortBy('transaction_date', Q.asc),
        Q.sortBy('created_at', Q.asc),
        Q.sortBy('id', Q.asc),
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
