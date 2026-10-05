import Transaction from '@/src/data/models/Transaction';
import { WorkplaceId } from '@/src/types/ids';
import { JournalStatus } from '@/src/types/enums';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';
import { Q, Query } from '@nozbe/watermelondb';

export const EDITOR_JOURNAL_STATUSES = [...ACTIVE_JOURNAL_STATUSES, JournalStatus.PLANNED] as const;

export function activeJournalOnClauses(workplaceId: WorkplaceId): Q.Clause[] {
  return [
    Q.on('journals', 'workplace_id', Q.eq(workplaceId)),
    Q.on('journals', 'status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
    Q.on('journals', 'deleted_at', Q.eq(null)),
  ];
}

export function activeJournalLegClauses(workplaceId: WorkplaceId): Q.Clause[] {
  return [Q.where('workplace_id', workplaceId), ...activeJournalOnClauses(workplaceId)];
}

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
    ...activeJournalOnClauses(workplaceId),
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
