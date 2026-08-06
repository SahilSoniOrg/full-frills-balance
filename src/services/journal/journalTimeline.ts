/**
 * Journal timeline read pipeline: observe → enrich → rows → presentation.
 */
export {
  observeEnrichedJournals,
  observeJournalTimelineRows,
} from '@/src/services/journal/journalTimelineReadModel';
export {
  enrichJournals,
  enrichedJournalsAreEqual,
  journalEnrichmentFingerprint,
} from '@/src/services/journal/enrichJournals';
export {
  journalsToTimelineRows,
  journalsFromTimelineRows,
  type JournalTimelineRow,
  type JournalTimelineRowsOptions,
} from '@/src/services/journal/journalTimelineRows';
export {
  journalDisplayTypeChrome,
  ledgerLineChrome,
  mapJournalToTimelineItem,
} from '@/src/services/journal/journalTimelinePresentation';
