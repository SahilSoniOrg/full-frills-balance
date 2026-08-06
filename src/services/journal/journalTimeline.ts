/**
 * Journal timeline read pipeline: observe → enrich → rows → presentation.
 */
export { observeEnrichedJournals } from '@/src/services/journal/journalTimelineReadModel';
export { enrichJournals, enrichedJournalsAreEqual } from '@/src/services/journal/enrichJournals';
export {
  journalsToTimelineRows,
  type JournalTimelineRow,
  type JournalTimelineRowsOptions,
} from '@/src/services/journal/journalTimelineRows';
export {
  journalDisplayTypeChrome,
  ledgerLineChrome,
  mapJournalToTimelineItem,
} from '@/src/services/journal/journalTimelinePresentation';
