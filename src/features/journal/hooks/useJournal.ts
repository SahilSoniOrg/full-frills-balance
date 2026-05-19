import { journalRepository } from '@/src/data/repositories/JournalRepository';
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
      journalId ? journalRepository.observeById(workplaceId, journalId, includeDeleted) : of(null),
    [workplaceId, journalId, includeDeleted],
    null,
  );
  return { journal, isLoading, version };
}
