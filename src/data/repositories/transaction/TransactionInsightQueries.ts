import { database } from '@/src/data/database/Database';
import Transaction from '@/src/data/models/Transaction';
import { AccountId, JournalId, TransactionId, WorkplaceId } from '@/src/types/ids';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';
import { Q } from '@nozbe/watermelondb';
import type { TransactionMetadata } from '../TransactionTypes';
import { rawSqlExecutor } from '../raw/RawSqlExecutor';

interface RawTransactionMetadataRow {
  id: string;
  journalId: string;
  accountId: string;
  amount: number;
  transactionDate: number;
  transactionType: TransactionMetadata['transactionType'];
  currencyCode: string;
}

/** Typed transaction projections consumed by insight calculations. */
export async function findActiveTransactionMetadata(
  workplaceId: WorkplaceId,
  accountIds: readonly AccountId[],
  startDate: number,
  endDate: number,
): Promise<TransactionMetadata[]> {
  if (accountIds.length === 0) return [];

  const accountPlaceholders = accountIds.map(() => '?').join(',');
  const statusPlaceholders = ACTIVE_JOURNAL_STATUSES.map(() => '?').join(',');
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
        AND j.status IN (${statusPlaceholders})
      ORDER BY t.transaction_date DESC
    `;
  const rows = await rawSqlExecutor.query<RawTransactionMetadataRow>(sql, [
    ...accountIds,
    startDate,
    endDate,
    workplaceId,
    workplaceId,
    workplaceId,
    ...ACTIVE_JOURNAL_STATUSES,
  ]);
  if (rows !== null) {
    return rows.map(row => ({
      ...row,
      id: row.id as TransactionId,
      journalId: row.journalId as JournalId,
      accountId: row.accountId as AccountId,
    }));
  }

  const transactions = await database.collections
    .get<Transaction>('transactions')
    .query(
      Q.where('workplace_id', workplaceId),
      Q.on('accounts', 'workplace_id', Q.eq(workplaceId)),
      Q.on('journals', 'workplace_id', Q.eq(workplaceId)),
      Q.on('journals', 'status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
      Q.on('journals', 'deleted_at', Q.eq(null)),
      Q.where('account_id', Q.oneOf([...accountIds])),
      Q.where('transaction_date', Q.gte(startDate)),
      Q.where('transaction_date', Q.lte(endDate)),
      Q.where('deleted_at', Q.eq(null)),
      Q.sortBy('transaction_date', Q.desc),
    )
    .fetch();

  return transactions.map(transaction => ({
    id: transaction.id,
    journalId: transaction.journalId,
    accountId: transaction.accountId,
    amount: transaction.amount,
    transactionDate: transaction.transactionDate,
    transactionType: transaction.transactionType,
    currencyCode: transaction.currencyCode,
  }));
}

export const transactionInsightQueries = {
  findActiveMetadata: findActiveTransactionMetadata,
};
