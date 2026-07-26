import { accountQueries } from '@/src/services/accounts/accountQueries';
import { journalObserveQueries } from '@/src/data/repositories/journal/journalTimelineModule';
import { useObservable } from '@/src/hooks/useObservable';
import { AccountId, JournalId, WorkplaceId } from '@/src/types/domain';
import React, { useMemo } from 'react';

export interface EntityStatus {
  exists: boolean;
  isDeleted: boolean;
}

export function useAuditAccounts(wokrplaceId: string) {
  const { data: accounts, isLoading } = useObservable(
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
  idsByEntityType: Record<string, string[]>,
) {
  const accountIds = useMemo(
    () => Array.from(new Set(idsByEntityType.account || [])) as AccountId[],
    [idsByEntityType.account],
  );
  const journalIds = useMemo(
    () => Array.from(new Set(idsByEntityType.journal || [])) as JournalId[],
    [idsByEntityType.journal],
  );

  const { data: accounts } = useObservable(
    () => accountQueries.observeByIdsWithDeleted(workplaceId, accountIds),
    [accountIds, workplaceId],
    [],
  );

  const { data: journals } = useObservable(
    () => journalObserveQueries.observeByIdsWithDeleted(workplaceId, journalIds),
    [workplaceId, journalIds],
    [],
  );

  const statusMap = useMemo(() => {
    const map: Record<string, EntityStatus> = {};

    accounts.forEach(a => {
      map[a.id] = { exists: true, isDeleted: !!a.deletedAt };
    });

    journals.forEach(j => {
      map[j.id] = { exists: true, isDeleted: !!j.deletedAt };
    });

    // Mark missing ones
    accountIds.forEach(id => {
      if (!map[id]) map[id] = { exists: false, isDeleted: false };
    });
    journalIds.forEach(id => {
      if (!map[id]) map[id] = { exists: false, isDeleted: false };
    });

    return map;
  }, [accounts, journals, accountIds, journalIds]);

  return statusMap;
}
