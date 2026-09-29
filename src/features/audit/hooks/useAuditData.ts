import { journalObserveQueries } from '@/src/data/repositories/journal/JournalObserveQueries';
import type { AuditStatusLookupType } from '@/src/types/auditEntityCapabilities';
import { EntityStatus } from '@/src/features/audit/auditLogTypes';
import { useObservable } from '@/src/hooks/useObservable';
import { accountQueries } from '@/src/services/accounts/accountQueries';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { AccountFields } from '@/src/types/plainDtos';
import { AccountId, BudgetId, JournalId, PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import React, { useMemo } from 'react';
import { combineLatest, map, of, type Observable } from 'rxjs';

const AUDIT_STATUS_QUERY_CHUNK_SIZE = 100;

function observeIdsInChunks<T, TId extends string>(
  ids: readonly TId[],
  observeChunk: (chunk: TId[]) => Observable<T[]>,
): Observable<T[]> {
  if (ids.length === 0) return of([]);

  const observations: Observable<T[]>[] = [];
  for (let index = 0; index < ids.length; index += AUDIT_STATUS_QUERY_CHUNK_SIZE) {
    observations.push(observeChunk(ids.slice(index, index + AUDIT_STATUS_QUERY_CHUNK_SIZE)));
  }

  if (observations.length === 1) return observations[0];
  return combineLatest(observations).pipe(map(groups => groups.flat()));
}

export function useAuditAccounts(wokrplaceId: string) {
  const { data: accounts = [], isLoading } = useObservable<AccountFields[]>(
    () => accountQueries.observeAll(wokrplaceId as WorkplaceId),
    [wokrplaceId],
    [],
  );

  const accountMap = React.useMemo(() => {
    const map: Record<string, { name: string; currency: string }> = {};
    accounts.forEach(acc => {
      map[acc.id] = { name: acc.name, currency: acc.currencyCode };
    });
    return map;
  }, [accounts]);

  return { accountMap, isLoading };
}

export function useAuditEntityStatus(
  workplaceId: WorkplaceId,
  idsByEntityType: Record<AuditStatusLookupType, string[]>,
) {
  const accountIds = useMemo(
    () => Array.from(new Set(idsByEntityType.account || [])) as AccountId[],
    [idsByEntityType.account],
  );
  const journalIds = useMemo(
    () => Array.from(new Set(idsByEntityType.journal || [])) as JournalId[],
    [idsByEntityType.journal],
  );
  const budgetIds = useMemo(
    () => Array.from(new Set(idsByEntityType.budget || [])) as BudgetId[],
    [idsByEntityType.budget],
  );
  const plannedPaymentIds = useMemo(
    () => Array.from(new Set(idsByEntityType.planned_payment || [])) as PlannedPaymentId[],
    [idsByEntityType.planned_payment],
  );

  const { data: accounts = [] } = useObservable<AccountFields[]>(
    () =>
      observeIdsInChunks(accountIds, chunk =>
        accountQueries.observeByIdsWithDeleted(workplaceId, chunk),
      ),
    [accountIds, workplaceId],
    [],
  );

  const { data: journals } = useObservable(
    () =>
      observeIdsInChunks(journalIds, chunk =>
        journalObserveQueries.observeByIdsWithDeleted(workplaceId, chunk),
      ),
    [workplaceId, journalIds],
    [],
  );
  const { data: budgets = [] } = useObservable(
    () => observeIdsInChunks(budgetIds, chunk => budgetRepository.observeByIds(workplaceId, chunk)),
    [workplaceId, budgetIds],
    [],
  );
  const { data: plannedPayments = [] } = useObservable(
    () =>
      observeIdsInChunks(plannedPaymentIds, chunk =>
        plannedPaymentRepository.observeByIdsIncludingDeleted(workplaceId, chunk),
      ),
    [workplaceId, plannedPaymentIds],
    [],
  );
  const { data: workplace } = useObservable(
    () => workplaceRepository.observeById(workplaceId),
    [workplaceId],
    null,
  );

  const statusMap = useMemo(() => {
    const map: Record<string, EntityStatus> = {};

    accounts.forEach(a => {
      map[a.id] = { exists: true, isDeleted: !!a.deletedAt };
    });

    journals.forEach(j => {
      map[j.id] = { exists: true, isDeleted: !!j.deletedAt };
    });
    budgets.forEach(budget => {
      map[budget.id] = { exists: true, isDeleted: false };
    });
    plannedPayments.forEach(payment => {
      map[payment.id] = { exists: true, isDeleted: !!payment.deletedAt };
    });
    if (workplace && idsByEntityType.workplace.includes(workplace.id)) {
      map[workplace.id] = { exists: true, isDeleted: false };
    }

    // Mark missing ones
    accountIds.forEach(id => {
      if (!map[id]) map[id] = { exists: false, isDeleted: false };
    });
    journalIds.forEach(id => {
      if (!map[id]) map[id] = { exists: false, isDeleted: false };
    });
    budgetIds.forEach(id => {
      if (!map[id]) map[id] = { exists: false, isDeleted: false };
    });
    plannedPaymentIds.forEach(id => {
      if (!map[id]) map[id] = { exists: false, isDeleted: false };
    });

    return map;
  }, [
    accounts,
    budgets,
    journals,
    plannedPayments,
    workplace,
    idsByEntityType.workplace,
    accountIds,
    budgetIds,
    journalIds,
    plannedPaymentIds,
  ]);

  return statusMap;
}
