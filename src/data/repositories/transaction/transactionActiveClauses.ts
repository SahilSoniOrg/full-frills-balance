import Transaction from '@/src/data/models/Transaction';
import { WorkplaceId } from '@/src/types/domain';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';
import { Q, Query } from '@nozbe/watermelondb';

/**
 * Centralized logic for defining what constitutes an "Active" (valid/non-deleted) transaction.
 * Prevents logic divergence across repositories and query modules.
 */
export function buildActiveClauses(
  workplaceId: WorkplaceId,
  extraClauses: Q.Clause[] = [],
): Q.Clause[] {
  return [
    Q.experimentalJoinTables(['journals']),
    Q.where('workplace_id', workplaceId),
    Q.where('deleted_at', Q.eq(null)),
    Q.on('journals', [
      Q.where('workplace_id', workplaceId),
      Q.where('status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
      Q.where('deleted_at', Q.eq(null)),
    ]),
    ...extraClauses,
  ];
}

export function deterministicSort(
  query: Query<Transaction>,
  qSort: Q.SortOrder = Q.desc,
): Query<Transaction> {
  return query.extend(
    Q.sortBy('transaction_date', qSort),
    Q.sortBy('created_at', qSort),
    Q.sortBy('id', qSort),
  );
}
