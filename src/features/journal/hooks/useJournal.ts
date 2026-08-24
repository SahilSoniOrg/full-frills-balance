import { useObservable } from '@/src/hooks/useObservable';
import { journalReadService } from '@/src/services/journal/journalReadService';
import { of } from 'rxjs';
import { WorkplaceId } from '@/src/types/ids';

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
      journalId ? journalReadService.observeById(workplaceId, journalId, includeDeleted) : of(null),
    [workplaceId, journalId, includeDeleted],
    null,
  );
  return { journal, isLoading, version };
}
