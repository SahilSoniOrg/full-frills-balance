import { journalRepository } from '@/src/data/repositories/JournalRepository'
import { useObservable } from '@/src/hooks/useObservable'
import { of } from 'rxjs'

export function useJournal(journalId: string | null) {
  const { data: journal, isLoading, version } = useObservable(
    () => journalId ? journalRepository.observeById(journalId) : of(null),
    [journalId],
    null
  )
  return { journal, isLoading, version }
}
