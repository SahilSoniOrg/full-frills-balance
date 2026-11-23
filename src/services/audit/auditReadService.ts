import { journalObserveQueries } from '@/src/data/repositories/journal/JournalObserveQueries';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { BudgetId, JournalId, PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import { map, type Observable } from 'rxjs';

/** Minimal presence row for audit entity-status lookups (includes soft-deleted). */
export type AuditEntityPresence = {
  id: string;
  deletedAt?: Date | number | null;
};

function presenceWithDeleted(record: {
  id: string;
  deletedAt?: Date | null;
}): AuditEntityPresence {
  return { id: record.id, deletedAt: record.deletedAt ?? null };
}

/** Read boundary for audit feature entity-status observation. */
export const auditReadService = {
  observeJournalsByIdsWithDeleted(
    workplaceId: WorkplaceId,
    journalIds: JournalId[],
  ): Observable<AuditEntityPresence[]> {
    return journalObserveQueries
      .observeByIdsWithDeleted(workplaceId, journalIds)
      .pipe(map(journals => journals.map(presenceWithDeleted)));
  },

  observeBudgetsByIds(
    workplaceId: WorkplaceId,
    budgetIds: BudgetId[],
  ): Observable<AuditEntityPresence[]> {
    return budgetRepository
      .observeByIds(workplaceId, budgetIds)
      .pipe(map(budgets => budgets.map(budget => ({ id: budget.id }))));
  },

  observePlannedPaymentsByIdsIncludingDeleted(
    workplaceId: WorkplaceId,
    ids: PlannedPaymentId[],
  ): Observable<AuditEntityPresence[]> {
    return plannedPaymentRepository
      .observeByIdsIncludingDeleted(workplaceId, ids)
      .pipe(map(payments => payments.map(presenceWithDeleted)));
  },

  observeWorkplaceById(workplaceId: WorkplaceId): Observable<AuditEntityPresence | null> {
    return workplaceRepository
      .observeById(workplaceId)
      .pipe(map(workplace => (workplace ? { id: workplace.id } : null)));
  },
};