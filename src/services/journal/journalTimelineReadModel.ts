import { journalEnrichmentQueries } from '@/src/data/repositories/journal/JournalEnrichmentQueries';
import { journalObserveQueries } from '@/src/data/repositories/journal/JournalObserveQueries';
import type { JournalTimelineDateRange } from '@/src/data/repositories/journal/JournalObserveQueries';
import { enrichJournals, enrichedJournalsAreEqual } from '@/src/services/journal/enrichJournals';
import { EnrichedJournal } from '@/src/types/domainReadModels';
import { JournalStatus } from '@/src/types/enums';
import { WorkplaceId } from '@/src/types/ids';
import { logger } from '@/src/utils/logger';
import { distinctUntilChanged, map, Observable, switchMap } from 'rxjs';
import {
  journalsToTimelineRows,
  JournalTimelineRow,
  JournalTimelineRowsOptions,
} from '@/src/services/journal/journalTimelineRows';

/**
 * Journal timeline read model: observe journals, enrich once, emit EnrichedJournal[].
 * Row expansion and card presentation live in journalTimelineRows and journalTimelinePresentation.
 */
export function observeEnrichedJournals(
  workplaceId: WorkplaceId,
  limit: number,
  dateRange?: JournalTimelineDateRange,
  searchQuery?: string,
  status?: JournalStatus[],
  options?: { minAmount?: number; maxAmount?: number; displayType?: string },
): Observable<EnrichedJournal[]> {
  const journalsObservable = journalObserveQueries.observeTimeline({
    workplaceId,
    limit,
    dateRange,
    searchQuery,
    status,
    minAmount: options?.minAmount,
    maxAmount: options?.maxAmount,
    displayType: options?.displayType,
  });

  return journalsObservable.pipe(
    switchMap(async journals => {
      logger.debug(`observeEnrichedJournals emission: length=${journals.length}`);
      if (journals.length === 0) return [] as EnrichedJournal[];

      const journalIds = journals.map(j => j.id);
      const enrichmentData = await journalEnrichmentQueries.getEnrichmentDataRaw(
        workplaceId,
        journalIds,
      );
      return enrichJournals(journals, enrichmentData);
    }),
    distinctUntilChanged(enrichedJournalsAreEqual),
  );
}

export function observeJournalTimelineRows(
  workplaceId: WorkplaceId,
  limit: number,
  dateRange?: JournalTimelineDateRange,
  searchQuery?: string,
  status?: JournalStatus[],
  options?: { minAmount?: number; maxAmount?: number; displayType?: string },
  rowOptions?: JournalTimelineRowsOptions,
): Observable<JournalTimelineRow[]> {
  return observeEnrichedJournals(workplaceId, limit, dateRange, searchQuery, status, options).pipe(
    map(journals => journalsToTimelineRows(journals, rowOptions)),
  );
}
