import { AccountType, TransactionType, EnrichedJournal, WorkplaceId } from '@/src/types/domain';

import { JournalStatus } from '@/src/data/models/Journal';

import {
  journalEnrichmentQueries,
  journalsQuery,
} from '@/src/data/repositories/journal/journalTimelineModule';
import { JournalObserveFilter } from '@/src/types/journalTimeline';
import { journalPresenter } from '@/src/services/accounting/journalPresenter';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';
import { logger } from '@/src/utils/logger';
import { Q } from '@nozbe/watermelondb';
import { Observable, distinctUntilChanged, switchMap } from 'rxjs';

/**
 * Observe journals with their associated accounts for UI display.
 * Uses a reactive pipeline to enrich journals with account info, semantic types, and labels.
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
    clauses.push(Q.on('transactions', Q.where('account_id', Q.oneOf(accountIds))));
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
      const enrichmentData = await journalEnrichmentQueries.getEnrichmentDataRaw(journalIds);

      const dataByJournal = new Map<string, typeof enrichmentData>();
      for (const row of enrichmentData) {
        const list = dataByJournal.get(row.journal_id) || [];
        list.push(row);
        dataByJournal.set(row.journal_id, list);
      }

      return journals.map(j => {
        const rows = dataByJournal.get(j.id) || [];

        const accountTypesMap = new Map<string, AccountType>();
        rows.forEach(r => accountTypesMap.set(r.account_id, r.account_type));

        const enrichedAccounts = rows.map(r => ({
          id: r.account_id,
          name: r.account_name,
          accountType: r.account_type,
          role: (r.transaction_type === TransactionType.CREDIT ? 'SOURCE' : 'DESTINATION') as
            'SOURCE' | 'DESTINATION',
          icon: r.account_icon,
          amount: r.amount,
        }));

        const txsForPresenter = rows.map(r => ({
          accountId: r.account_id,
          amount: r.amount,
          transactionType: r.transaction_type,
        }));

        const { source, destination } = journalPresenter.getSourceAndDestTypes(
          txsForPresenter,
          accountTypesMap,
        );
        const semanticType = journalPresenter.getSemanticType(source, destination);
        const displayType = journalPresenter.getJournalDisplayType(
          txsForPresenter,
          accountTypesMap,
        );
        const semanticLabel = journalPresenter.getJournalSemanticLabel(
          txsForPresenter,
          accountTypesMap,
        );

        return {
          id: j.id,
          journalDate: j.journalDate,
          description: j.description,
          notes: j.notes,
          currencyCode: j.currencyCode,
          status: j.status,
          totalAmount: j.totalAmount || 0,
          transactionCount: j.transactionCount || 0,
          displayType,
          semanticType,
          semanticLabel,
          accounts: enrichedAccounts,
          plannedPaymentId: j.plannedPaymentId,
        } as EnrichedJournal;
      });
    }),
    distinctUntilChanged((prev, curr) => {
      if (prev.length !== curr.length) return false;
      for (let i = 0; i < prev.length; i++) {
        const p = prev[i];
        const c = curr[i];
        if (
          p.id !== c.id ||
          p.status !== c.status ||
          p.description !== c.description ||
          p.notes !== c.notes ||
          p.totalAmount !== c.totalAmount ||
          p.transactionCount !== c.transactionCount ||
          p.journalDate !== c.journalDate ||
          p.currencyCode !== c.currencyCode ||
          p.displayType !== c.displayType ||
          p.semanticType !== c.semanticType ||
          p.semanticLabel !== c.semanticLabel ||
          p.plannedPaymentId !== c.plannedPaymentId ||
          p.accounts.length !== c.accounts.length
        )
          return false;

        for (let j = 0; j < p.accounts.length; j++) {
          const pa = p.accounts[j];
          const ca = c.accounts[j];
          if (
            pa.id !== ca.id ||
            pa.name !== ca.name ||
            pa.accountType !== ca.accountType ||
            pa.role !== ca.role ||
            pa.icon !== ca.icon
          ) {
            return false;
          }
        }
      }
      return true;
    }),
  );
}
