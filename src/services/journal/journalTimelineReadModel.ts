import { journalEnrichmentQueries } from '@/src/data/repositories/journal/JournalEnrichmentQueries';
import { throwIfShareAborted } from '@/src/services/sharing/sharingCancellation';
import { journalObserveQueries } from '@/src/data/repositories/journal/JournalObserveQueries';
import { accountObserveQueries } from '@/src/data/repositories/account';
import type {
  JournalTimelineDateRange,
  JournalTimelineQuery,
  JournalTimelineCursor,
} from '@/src/data/repositories/journal/JournalObserveQueries';
import { enrichJournals, enrichedJournalsAreEqual } from '@/src/services/journal/enrichJournals';
import { EnrichedJournal } from '@/src/types/domainReadModels';
import { JournalStatus } from '@/src/types/enums';
import { WorkplaceId } from '@/src/types/ids';
import { distinctUntilChanged, from, map, Observable, switchMap } from 'rxjs';
import {
  journalsToTimelineRows,
  JournalTimelineRow,
  JournalTimelineRowsOptions,
} from '@/src/services/journal/journalTimelineRows';

/** Read and enrich one bounded page at a time, independently of the list's loaded pages. */
export async function* iterateEnrichedJournalTimeline(
  query: Omit<JournalTimelineQuery, 'limit'>,
  signal: AbortSignal,
): AsyncGenerator<EnrichedJournal[]> {
  const createdBefore = Date.now();
  let cursor: JournalTimelineCursor | undefined;
  do {
    throwIfShareAborted(signal);
    // Keep both journal reads and enrichment below older SQLite bind-parameter limits.
    const page = await journalObserveQueries.fetchTimelinePage(query, {
      limit: 500,
      createdBefore,
      cursor,
    });
    throwIfShareAborted(signal);
    if (page.journals.length === 0) return;
    const rows = await journalEnrichmentQueries.getEnrichmentDataRaw(
      query.workplaceId,
      page.journals.map(journal => journal.id),
    );
    throwIfShareAborted(signal);
    yield enrichJournals(page.journals, rows);
    cursor = page.nextCursor;
  } while (cursor);
}

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
