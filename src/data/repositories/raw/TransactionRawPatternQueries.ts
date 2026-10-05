import { database } from '@/src/data/database/Database';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import {
  ACTIVE_JOURNAL_STATUSES,
  activeJournalStatusSqlPlaceholders,
} from '@/src/utils/journalStatus';
import { activeJournalLegClauses } from '../transaction/transactionActiveClauses';
import { Q } from '@nozbe/watermelondb';
import Journal from '../../models/Journal';
import Transaction from '../../models/Transaction';
import { RecurringPattern } from '../TransactionTypes';
import { rawSqlExecutor } from './RawSqlExecutor';

export class TransactionRawPatternQueries {
  async getRecurringPatternsRaw(
    workplaceId: WorkplaceId,
    startDate: number,
    minCount: number,
  ): Promise<RecurringPattern[]> {
    const placeholders = activeJournalStatusSqlPlaceholders();

    const sql = `
      SELECT
        t.amount,
        t.account_id AS accountId,
        t.currency_code AS currencyCode,
        j.description,
        COUNT(*) AS occurrenceCount,
        GROUP_CONCAT(t.journal_id) AS journalIds,
        GROUP_CONCAT(t.transaction_date) AS transactionDates,
        MIN(t.transaction_date) AS firstDate,
        MAX(t.transaction_date) AS lastDate
      FROM transactions t
      JOIN journals j ON t.journal_id = j.id
      WHERE t.transaction_date >= ?
        AND t.workplace_id = ?
        AND j.workplace_id = ?
        AND t.deleted_at IS NULL
        AND j.deleted_at IS NULL
        AND j.status IN (${placeholders})
      GROUP BY t.amount, t.account_id, t.currency_code, j.description
      HAVING COUNT(*) >= ?
      ORDER BY occurrenceCount DESC
    `;

    const raws = await rawSqlExecutor.query<RecurringPattern>(sql, [
      startDate,
      workplaceId,
      workplaceId,
      ...ACTIVE_JOURNAL_STATUSES,
      minCount,
    ]);
    if (raws !== null) return raws;

    const txs = await database.collections
      .get<Transaction>('transactions')
      .query(
        ...activeJournalLegClauses(workplaceId),
        Q.where('transaction_date', Q.gte(startDate)),
        Q.where('deleted_at', Q.eq(null)),
      )
      .fetch();
    const journalIds = [...new Set(txs.map(tx => tx.journalId))];
    const journals = journalIds.length
      ? await database.collections
          .get<Journal>('journals')
          .query(Q.where('workplace_id', workplaceId), Q.where('id', Q.oneOf(journalIds)))
          .fetch()
      : [];
    const descriptionByJournalId = new Map(journals.map(j => [j.id, j.description]));

    const grouped = new Map<
      string,
      {
        amount: number;
        accountId: AccountId;
        currencyCode: string;
        description?: string;
        occurrenceCount: number;
        journalIds: Set<string>;
        transactionDates: number[];
        firstDate: number;
        lastDate: number;
      }
    >();

    for (const tx of txs) {
      const description = descriptionByJournalId.get(tx.journalId) ?? undefined;
      const key = JSON.stringify([tx.amount, tx.accountId, tx.currencyCode, description ?? null]);
      const existing = grouped.get(key);

      if (existing) {
        existing.occurrenceCount += 1;
        existing.journalIds.add(tx.journalId);
        existing.transactionDates.push(tx.transactionDate);
        if (tx.transactionDate < existing.firstDate) existing.firstDate = tx.transactionDate;
        if (tx.transactionDate > existing.lastDate) existing.lastDate = tx.transactionDate;
      } else {
        grouped.set(key, {
          amount: tx.amount,
          accountId: tx.accountId,
          currencyCode: tx.currencyCode,
          description,
          occurrenceCount: 1,
          journalIds: new Set([tx.journalId]),
          transactionDates: [tx.transactionDate],
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
        description: g.description,
        occurrenceCount: g.occurrenceCount,
        journalIds: Array.from(g.journalIds).join(','),
        transactionDates: g.transactionDates.join(','),
        firstDate: g.firstDate,
        lastDate: g.lastDate,
      }));
  }
}

export const transactionRawPatternQueries = new TransactionRawPatternQueries();
