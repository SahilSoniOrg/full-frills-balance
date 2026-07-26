import { journalObserveQueries } from '@/src/data/repositories/journal/journalTimelineModule';
import { useObservable } from '@/src/hooks/useObservable';
import { of } from 'rxjs';
import { WorkplaceId } from '@/src/types/domain';

export function useJournal(
  workplaceId: WorkplaceId,
  journalId: string | null,
  includeDeleted: boolean = false,
) {
  const {
    data: journal,
    isLoading,
    version,
  } = useObservable(
    () =>
      journalId
        ? journalObserveQueries.observeById(workplaceId, journalId, includeDeleted)
        : of(null),
    [workplaceId, journalId, includeDeleted],
    null,
  );
  return { journal, isLoading, version };
}
