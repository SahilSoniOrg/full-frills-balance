import { database } from '@/src/data/database/Database';
import Journal from '@/src/data/models/Journal';
import { Q } from '@nozbe/watermelondb';

/**
 * Narrow timeline/read intent: list, by-id, observation, and enrichment queries.
 * Prefer this over `JournalRepository` for journal reads used in timelines and UI lists.
 */
export { journalQueryRepository } from '@/src/data/repositories/journal/journalQueryRepository';
export { journalListQueryRepository } from '@/src/data/repositories/journal/journalListQueryRepository';
export { journalObserveQueries } from '@/src/data/repositories/journal/JournalObserveQueries';
export { journalEnrichmentQueries } from '@/src/data/repositories/journal/JournalEnrichmentQueries';

export function journalsQuery(...clauses: Q.Clause[]) {
  return database.collections
    .get<Journal>('journals')
    .query(Q.where('deleted_at', Q.eq(null)), ...clauses);
}
