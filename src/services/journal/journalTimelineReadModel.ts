import {
  journalEnrichmentQueries,
  journalsQuery,
} from '@/src/data/repositories/journal/journalTimelineModule';
import { enrichJournals, enrichedJournalsAreEqual } from '@/src/services/journal/enrichJournals';
import { EnrichedJournal, JournalStatus, WorkplaceId } from '@/src/types/domain';
import { JournalObserveFilter } from '@/src/types/journalTimeline';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';
import { logger } from '@/src/utils/logger';
import { Q } from '@nozbe/watermelondb';
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
  dateRange?: JournalObserveFilter,
  searchQuery?: string,
  status?: JournalStatus[],
  options?: { minAmount?: number; maxAmount?: number; displayType?: string },
): Observable<EnrichedJournal[]> {
  const clauses: Q.Clause[] = [
    Q.experimentalJoinTables(['transactions']),
    Q.where('workplace_id', workplaceId),
    Q.where('deleted_at', Q.eq(null)),
    Q.where('status', Q.oneOf(status || [...ACTIVE_JOURNAL_STATUSES])),
    Q.sortBy('journal_date', 'desc'),
    Q.sortBy('created_at', 'desc'),
    Q.take(limit),
  ];

  const accountIds = dateRange?.accountIds || (dateRange?.accountId ? [dateRange.accountId] : []);

  if (accountIds.length > 0 && !dateRange?.plannedPaymentId) {
    clauses.push(
      Q.on('transactions', [
        Q.where('workplace_id', workplaceId),
        Q.where('account_id', Q.oneOf(accountIds)),
        Q.where('deleted_at', Q.eq(null)),
      ]),
    );
  }

  if (dateRange) {
    if (dateRange.startDate !== undefined) {
      clauses.push(Q.where('journal_date', Q.gte(dateRange.startDate)));
    }
    if (dateRange.endDate !== undefined) {
      clauses.push(Q.where('journal_date', Q.lte(dateRange.endDate)));
    }

    if (dateRange.journalIds && dateRange.journalIds.length > 0) {
      clauses.push(Q.where('id', Q.oneOf(dateRange.journalIds)));
    }

    if (dateRange.plannedPaymentId) {
      clauses.push(Q.where('planned_payment_id', Q.eq(dateRange.plannedPaymentId)));
    }
  }

  if (searchQuery) {
    const q = searchQuery.trim();
    if (q) {
      clauses.push(
        Q.or(
          Q.where('description', Q.like(`%${Q.sanitizeLikeString(q)}%`)),
          Q.where('notes', Q.like(`%${Q.sanitizeLikeString(q)}%`)),
        ),
      );
    }
  }

  if (options?.minAmount !== undefined) {
    clauses.push(Q.where('total_amount', Q.gte(options.minAmount)));
  }
  if (options?.maxAmount !== undefined) {
    clauses.push(Q.where('total_amount', Q.lte(options.maxAmount)));
  }
  if (options?.displayType) {
    clauses.push(Q.where('display_type', Q.eq(options.displayType)));
  }

  const journalsObservable = journalsQuery(...clauses).observeWithColumns([
    'journal_date',
    'description',
    'notes',
    'currency_code',
    'status',
    'total_amount',
    'transaction_count',
    'display_type',
    'updated_at',
  ]);

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
  dateRange?: JournalObserveFilter,
  searchQuery?: string,
  status?: JournalStatus[],
  options?: { minAmount?: number; maxAmount?: number; displayType?: string },
  rowOptions?: JournalTimelineRowsOptions,
): Observable<JournalTimelineRow[]> {
  return observeEnrichedJournals(workplaceId, limit, dateRange, searchQuery, status, options).pipe(
    map(journals => journalsToTimelineRows(journals, rowOptions)),
  );
}
