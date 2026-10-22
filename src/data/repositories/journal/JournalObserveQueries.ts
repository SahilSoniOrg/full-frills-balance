import { database } from '@/src/data/database/Database';
import Journal from '@/src/data/models/Journal';
import { observeQueryWithModelChanges } from '@/src/data/repositories/observeQueryWithModelChanges';
import { JournalDisplayType, JournalStatus } from '@/src/types/enums';
import { JournalId, PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import type { PlainJournal } from '@/src/types/plainDtos';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';
import { Q } from '@nozbe/watermelondb';
import { map, of } from 'rxjs';

export interface JournalTimelineDateRange {
  startDate?: number;
  endDate?: number;
  accountId?: string;
  journalIds?: string[];
  plannedPaymentId?: string;
  accountIds?: string[];
}

export interface JournalTimelineQuery {
  workplaceId: WorkplaceId;
  limit: number;
  dateRange?: JournalTimelineDateRange;
  searchQuery?: string;
  status?: JournalStatus[];
  minAmount?: number;
  maxAmount?: number;
  displayType?: string;
}

export interface JournalTimelineCursor {
  journalDate: number;
  createdAt: number;
  id: JournalId;
}

type TimelineJournalRaw = {
  id: JournalId;
  journal_date: number;
  created_at: number;
  description: string | null;
  notes: string | null;
  currency_code: string;
  status: JournalStatus;
  total_amount: number;
  transaction_count: number;
  display_type: JournalDisplayType;
  planned_payment_id: PlannedPaymentId | null;
};

const JOURNAL_LIST_OBSERVE_COLUMNS = [
  'journal_date',
  'description',
  'notes',
  'currency_code',
  'status',
  'total_amount',
  'transaction_count',
  'display_type',
  'updated_at',
  'deleted_at',
] as const;

/** Reactive journal and account-transaction observation queries. */
export class JournalObserveQueries {
  private get journals() {
    return database.collections.get<Journal>('journals');
  }

  /** Full linked activity for detail summaries; intentionally independent of timeline pagination. */
  observeByPlannedPayment(workplaceId: WorkplaceId, plannedPaymentId: PlannedPaymentId) {
    return this.journals
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('planned_payment_id', plannedPaymentId),
        Q.where('deleted_at', Q.eq(null)),
      )
      .observeWithColumns([
        ...JOURNAL_LIST_OBSERVE_COLUMNS,
        'planned_payment_id',
        'original_journal_id',
      ]);
  }

  observeTimeline(query: JournalTimelineQuery) {
    return this.timelineQuery(query).observeWithColumns([...JOURNAL_LIST_OBSERVE_COLUMNS]);
  }

  /** Bounded plain records avoid populating the model cache during full-history exports. */
  async fetchTimelinePage(
    query: Omit<JournalTimelineQuery, 'limit'>,
    page: { limit: number; createdBefore: number; cursor?: JournalTimelineCursor },
  ): Promise<{ journals: PlainJournal[]; nextCursor?: JournalTimelineCursor }> {
    if (query.dateRange?.accountIds?.length === 0 || query.dateRange?.journalIds?.length === 0) {
      return { journals: [] };
    }
    const clauses: Q.Clause[] = [Q.where('created_at', Q.lte(page.createdBefore))];
    const { cursor } = page;
    if (cursor) {
      clauses.push(
        Q.or(
          Q.where('journal_date', Q.lt(cursor.journalDate)),
          Q.and(
            Q.where('journal_date', cursor.journalDate),
            Q.where('created_at', Q.lt(cursor.createdAt)),
          ),
          Q.and(
            Q.where('journal_date', cursor.journalDate),
            Q.where('created_at', cursor.createdAt),
            Q.where('id', Q.lt(cursor.id)),
          ),
        ),
      );
    }
    const rows: TimelineJournalRaw[] = await this.timelineQuery({ ...query, limit: page.limit })
      .extend(...clauses)
      .unsafeFetchRaw();
    const last = rows.length === page.limit ? rows[rows.length - 1] : undefined;
    return {
      journals: rows.map(row => ({
        id: row.id,
        journalDate: row.journal_date,
        createdAt: row.created_at,
        description: row.description ?? undefined,
        notes: row.notes ?? undefined,
        currencyCode: row.currency_code,
        status: row.status,
        totalAmount: row.total_amount,
        transactionCount: row.transaction_count,
        displayType: row.display_type,
        plannedPaymentId: row.planned_payment_id ?? undefined,
      })),
      nextCursor: last
        ? { journalDate: last.journal_date, createdAt: last.created_at, id: last.id }
        : undefined,
    };
  }

  private timelineQuery({
    workplaceId,
    limit,
    dateRange,
    searchQuery,
    status,
    minAmount,
    maxAmount,
    displayType,
  }: JournalTimelineQuery) {
    const clauses: Q.Clause[] = [
      Q.experimentalJoinTables(['transactions']),
      Q.where('workplace_id', workplaceId),
      Q.where('deleted_at', Q.eq(null)),
      Q.where('status', Q.oneOf(status || [...ACTIVE_JOURNAL_STATUSES])),
      Q.sortBy('journal_date', 'desc'),
      Q.sortBy('created_at', 'desc'),
      Q.sortBy('id', 'desc'),
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
      if (dateRange.journalIds?.length) {
        clauses.push(Q.where('id', Q.oneOf(dateRange.journalIds)));
      }
      if (dateRange.plannedPaymentId) {
        clauses.push(Q.where('planned_payment_id', Q.eq(dateRange.plannedPaymentId)));
      }
    }

    const query = searchQuery?.trim();
    if (query) {
      clauses.push(
        Q.or(
          Q.where('description', Q.like(`%${Q.sanitizeLikeString(query)}%`)),
          Q.where('notes', Q.like(`%${Q.sanitizeLikeString(query)}%`)),
        ),
      );
    }

    if (minAmount !== undefined) clauses.push(Q.where('total_amount', Q.gte(minAmount)));
    if (maxAmount !== undefined) clauses.push(Q.where('total_amount', Q.lte(maxAmount)));
    if (displayType) clauses.push(Q.where('display_type', Q.eq(displayType)));

    return this.journals.query(...clauses);
  }

  observeByIdsWithDeleted(workplaceId: WorkplaceId, journalIds: JournalId[]) {
    if (journalIds.length === 0) {
      return of([] as Journal[]);
    }

    return this.journals
      .query(Q.where('id', Q.oneOf(journalIds)), Q.where('workplace_id', workplaceId))
      .observeWithColumns([...JOURNAL_LIST_OBSERVE_COLUMNS]);
  }

  observeById(workplaceId: WorkplaceId, journalId: string, includeDeleted: boolean = false) {
    const clauses = [Q.where('id', journalId), Q.where('workplace_id', workplaceId)];
    if (!includeDeleted) {
      clauses.push(Q.where('deleted_at', Q.eq(null)));
    }

    return this.journals
      .query(...clauses)
      .observeWithColumns([...JOURNAL_LIST_OBSERVE_COLUMNS])
      .pipe(map(journals => journals[0] || null));
  }

  observeByIds(workplaceId: WorkplaceId, journalIds: JournalId[]) {
    if (journalIds.length === 0) return of([] as Journal[]);
    return this.journals
      .query(
        Q.where('id', Q.oneOf(journalIds)),
        Q.where('workplace_id', workplaceId),
        Q.where('deleted_at', Q.eq(null)),
      )
      .observeWithColumns([...JOURNAL_LIST_OBSERVE_COLUMNS]);
  }

  observeStatusMeta(workplaceId: WorkplaceId) {
    return this.journals
      .query(Q.where('deleted_at', Q.eq(null)), Q.where('workplace_id', workplaceId))
      .observeWithColumns(['status', 'deleted_at', 'journal_date', 'updated_at', 'total_amount']);
  }

  observePlannedInRange(workplaceId: WorkplaceId, startDate: number, endDate: number) {
    return observeQueryWithModelChanges(
      this.journals.query(
        Q.where('workplace_id', workplaceId),
        Q.where('status', JournalStatus.PLANNED),
        Q.where('journal_date', Q.gte(startDate)),
        Q.where('journal_date', Q.lte(endDate)),
        Q.where('deleted_at', Q.eq(null)),
      ),
    );
  }

  observeAllPlanned(workplaceId: WorkplaceId) {
    return this.journals
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('status', JournalStatus.PLANNED),
        Q.where('deleted_at', Q.eq(null)),
      )
      .observeWithColumns([
        'status',
        'journal_date',
        'total_amount',
        'currency_code',
        'deleted_at',
        'planned_payment_id',
        'updated_at',
      ]);
  }
}

export const journalObserveQueries = new JournalObserveQueries();
