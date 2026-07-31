import { AccountId, WorkplaceId } from '@/src/types/domain';
import { preferences } from '@/src/utils/preferences';
import { useMemo } from 'react';

export interface JournalNavMemory {
  readonly lastUsedSourceAccountId: AccountId | undefined;
  readonly lastUsedDestinationAccountId: AccountId | undefined;
  setLastUsedSourceAccountId: (accountId: AccountId | undefined) => void;
  setLastUsedDestinationAccountId: (accountId: AccountId | undefined) => void;
}

/**
 * Last-used journal account ids for entry defaults.
 * `workplaceId` is accepted for upcoming per-workplace scoping (F9); prefs are global today.
 */
export function useJournalNavMemory(_workplaceId: WorkplaceId): JournalNavMemory {
  return useMemo(
    () => ({
      get lastUsedSourceAccountId() {
        return preferences.journalNav.lastUsedSourceAccountId;
      },
      get lastUsedDestinationAccountId() {
        return preferences.journalNav.lastUsedDestinationAccountId;
      },
      setLastUsedSourceAccountId(accountId: AccountId | undefined) {
        preferences.journalNav.setLastUsedSourceAccountId(accountId);
      },
      setLastUsedDestinationAccountId(accountId: AccountId | undefined) {
        preferences.journalNav.setLastUsedDestinationAccountId(accountId);
      },
    }),
    [_workplaceId],
  );
}
