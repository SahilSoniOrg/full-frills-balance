import { toPlainJournal } from '@/src/data/models/Journal';
import {
  journalObserveQueries,
  journalQueryRepository,
} from '@/src/data/repositories/journal/journalTimelineModule';
import { JournalId, PlainJournal, WorkplaceId } from '@/src/types/domain';
import { map, Observable } from 'rxjs';

/** Read boundary for journal feature consumers. */
export class JournalReadService {
  observeById(
    workplaceId: WorkplaceId,
    journalId: string,
    includeDeleted: boolean = false,
  ): Observable<PlainJournal | null> {
    return journalObserveQueries
      .observeById(workplaceId, journalId, includeDeleted)
      .pipe(map(journal => (journal ? toPlainJournal(journal) : null)));
  }

  async find(workplaceId: WorkplaceId, journalId: JournalId): Promise<PlainJournal | null> {
    const journal = await journalQueryRepository.find(workplaceId, journalId);
    return journal ? toPlainJournal(journal) : null;
  }
}

export const journalReadService = new JournalReadService();
