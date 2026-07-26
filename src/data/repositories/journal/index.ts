/**
 * Journal data access — import from intent modules (`*Module`) or this barrel.
 * Write path: `journalWriteModule`. Timeline reads: `journalTimelineModule`.
 */
export {
  journalWriteRepository,
  type CreateJournalData,
  type PrepareCreateJournalData,
} from '@/src/data/repositories/journal/journalWriteModule';

export {
  journalQueryRepository,
  journalListQueryRepository,
  journalObserveQueries,
  journalEnrichmentQueries,
  journalsQuery,
} from '@/src/data/repositories/journal/journalTimelineModule';

export { journalMetadataRepository } from '@/src/data/repositories/journal/journalMetadataModule';

export { smsJournalQueries } from '@/src/data/repositories/journal/journalSmsModule';

export { journalPlannedQueries } from '@/src/data/repositories/journal/journalPlannedModule';
