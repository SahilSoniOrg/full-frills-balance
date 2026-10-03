import { journalEnrichmentQueries } from '@/src/data/repositories/journal/JournalEnrichmentQueries';
import { journalObserveQueries } from '@/src/data/repositories/journal/JournalObserveQueries';
import { accountObserveQueries } from '@/src/data/repositories/account';
import type { JournalTimelineDateRange } from '@/src/data/repositories/journal/JournalObserveQueries';
import { enrichJournals, enrichedJournalsAreEqual } from '@/src/services/journal/enrichJournals';
import { EnrichedJournal } from '@/src/types/domainReadModels';
import { JournalStatus } from '@/src/types/enums';
import { WorkplaceId } from '@/src/types/ids';
import { logger } from '@/src/utils/logger';
import { distinctUntilChanged, from, map, Observable, switchMap } from 'rxjs';
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
    switchMap(journals => {
      logger.debug(`observeEnrichedJournals emission: length=${journals.length}`);
      const journalIds = journals.map(j => j.id);
      return from(
        journals.length === 0
          ? Promise.resolve([])
          : journalEnrichmentQueries.getEnrichmentDataRaw(workplaceId, journalIds),
      ).pipe(
        switchMap(enrichmentData =>
          accountObserveQueries
            .observeByIds(workplaceId, [...new Set(enrichmentData.map(row => row.account_id))])
            .pipe(
              map(accounts => {
                // Account color edits do not modify journals; observe only the linked accounts.
                const accountColors = new Map(accounts.map(account => [account.id, account.color]));
                return enrichJournals(
                  journals,
                  enrichmentData.map(row => ({
                    ...row,
                    account_color: accountColors.has(row.account_id)
                      ? accountColors.get(row.account_id)
                      : row.account_color,
                  })),
                );
              }),
            ),
        ),
      );
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
