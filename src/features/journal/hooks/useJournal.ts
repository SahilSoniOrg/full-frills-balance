import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { useObservable } from '@/src/hooks/useObservable';
import { of } from 'rxjs';

export function useJournal(journalId: string | null, includeDeleted: boolean = false) {
  const {
    data: journal,
    isLoading,
    version,
  } = useObservable(
    () => (journalId ? journalRepository.observeById(journalId, includeDeleted) : of(null)),
    [journalId, includeDeleted],
    null,
  );
  return { journal, isLoading, version };
}
