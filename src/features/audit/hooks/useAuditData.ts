import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { useObservable } from '@/src/hooks/useObservable';
import React, { useMemo } from 'react';

export interface EntityStatus {
  exists: boolean;
  isDeleted: boolean;
}

export function useAuditAccounts() {
  const { data: accounts, isLoading } = useObservable(() => accountRepository.observeAll(), [], []);

  const accountMap = React.useMemo(() => {
    const map: Record<string, { name: string; currency: string }> = {};
    accounts.forEach(acc => {
      map[acc.id] = { name: acc.name, currency: acc.currencyCode };
    });
    return map;
  }, [accounts]);

  return { accountMap, isLoading };
}

export function useAuditEntityStatus(idsByEntityType: Record<string, string[]>) {
  const accountIds = useMemo(
    () => Array.from(new Set(idsByEntityType.account || [])),
    [idsByEntityType.account],
  );
  const journalIds = useMemo(
    () => Array.from(new Set(idsByEntityType.journal || [])),
    [idsByEntityType.journal],
  );

  const { data: accounts } = useObservable(
    () => accountRepository.observeByIdsWithDeleted(accountIds),
    [accountIds],
    [],
  );

  const { data: journals } = useObservable(
    () => journalRepository.observeByIdsWithDeleted(journalIds),
    [journalIds],
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
