import { database } from '@/src/data/database/Database';
import type Journal from '@/src/data/models/Journal';
import type Transaction from '@/src/data/models/Transaction';
import type { WorkplaceId } from '@/src/types/ids';
import { Q } from '@nozbe/watermelondb';

/** The rows that prove a Cash Clarity publication committed atomically. */
export interface CashClarityPublicationManifest {
  readonly accountIds: readonly string[];
  readonly journalIds: readonly string[];
  readonly plannedPaymentIds: readonly string[];
  readonly budgetIds: readonly string[];
  readonly budgetScopeIds: readonly string[];
}

export interface CashClarityBalanceRebuildImpact {
  readonly accountIds: readonly string[];
  readonly fromDate: number | null;
}

/**
 * Read boundary for receipt-based Cash Clarity recovery. These lookups include
 * soft-deleted rows: a later user deletion does not invalidate the original commit.
 */
export class CashClarityPublicationRepository {
  private async countIds(
    table: string,
    workplaceId: WorkplaceId,
    ids: readonly string[],
  ): Promise<number> {
    if (ids.length === 0) return 0;
    return (
      await database
        .get(table)
        .query(Q.where('workplace_id', workplaceId), Q.where('id', Q.oneOf([...ids])))
        .fetch()
    ).length;
  }

  async hasCompletePublication(
    workplaceId: WorkplaceId,
    manifest: CashClarityPublicationManifest,
  ): Promise<boolean> {
    const records = [
      { table: 'accounts', ids: manifest.accountIds },
      { table: 'journals', ids: manifest.journalIds },
      { table: 'planned_payments', ids: manifest.plannedPaymentIds },
      { table: 'budgets', ids: manifest.budgetIds },
      { table: 'budget_scopes', ids: manifest.budgetScopeIds },
    ];
    const counts = await Promise.all(
      records.map(({ table, ids }) => this.countIds(table, workplaceId, ids)),
    );
    return counts.every((count, index) => count === records[index].ids.length);
  }

  /** Recovers rebuild inputs from receipts written before the impact fields existed. */
  async findBalanceRebuildImpact(
    workplaceId: WorkplaceId,
    journalIds: readonly string[],
  ): Promise<CashClarityBalanceRebuildImpact> {
    if (journalIds.length === 0) return { accountIds: [], fromDate: null };
    const journals = await database
      .get<Journal>('journals')
      .query(Q.where('workplace_id', workplaceId), Q.where('id', Q.oneOf([...journalIds])))
      .fetch();
    const transactions = await database
      .get<Transaction>('transactions')
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('journal_id', Q.oneOf([...journalIds])),
      )
      .fetch();
    return {
      accountIds: [...new Set(transactions.map(transaction => transaction.accountId))],
      fromDate: journals.length > 0 ? Math.min(...journals.map(journal => journal.journalDate)) : null,
    };
  }
}

export const cashClarityPublicationRepository = new CashClarityPublicationRepository();
