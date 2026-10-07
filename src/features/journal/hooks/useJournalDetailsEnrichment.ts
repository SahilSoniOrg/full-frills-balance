import { useMemo } from 'react';
import { combineLatest, from, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { useObservable } from '@/src/hooks/useObservable';
import { findJournalMetadataByJournalId } from '@/src/data/repositories/journal/JournalEnrichmentQueries';
import { smsService } from '@/src/services/sms-service';
import { budgetReadService } from '@/src/services/budget/budgetReadService';
import { observeAuditTrail } from '@/src/services/audit-service';
import { accountQueries } from '@/src/services/accounts/accountQueries';
import { AccountType } from '@/src/types/enums';
import type { JournalId, WorkplaceId } from '@/src/types/ids';
import type { DisplayTransaction } from '@/src/types/domainReadModels';
import { AppNavigation } from '@/src/utils/navigation';
import type { JournalSourceModel } from '../journalDetailsPresentation';
import { journalHistoryAccountIds, mapJournalHistory } from '../journalHistoryPresentation';
import { buildJournalSource, type JournalSourceInfo } from '../journalSourcePresentation';

/** Metadata and inbox rows are read once per journal version; neither is observable. */
export function useJournalSource(
  journalId: JournalId,
  workplaceId: WorkplaceId,
  journalVersion: number,
) {
  const { data, error, retry } = useObservable<JournalSourceInfo>(
    () =>
      journalId
        ? combineLatest([
            from(findJournalMetadataByJournalId(journalId, workplaceId)),
            from(smsService.findAllByLinkedJournalId(workplaceId, journalId)),
          ]).pipe(map(([metadata, inboxRecords]) => buildJournalSource(metadata, inboxRecords)))
        : of({}),
    [journalId, workplaceId, journalVersion],
    {},
    { keepPreviousData: false },
  );
  const hasError = !!error;
  return useMemo(
    (): JournalSourceModel => ({
      ...data,
      error: hasError,
      onRetry: retry,
      onOpenSmsInbox: data.sms?.some(item => item.inboxRecordId)
        ? AppNavigation.toTransactionInbox
        : undefined,
    }),
    [data, hasError, retry],
  );
}

export function useJournalBudgetImpact(
  workplaceId: WorkplaceId,
  transactions: DisplayTransaction[],
  journalDate: number | undefined,
  today: number,
) {
  const expenseIds = useMemo(
    () =>
      [
        ...new Set(
          transactions
            .filter(item => item.accountType === AccountType.EXPENSE)
            .map(item => item.accountId),
        ),
      ].sort(),
    [transactions],
  );
  const { data, error, retry } = useObservable(
    () =>
      journalDate !== undefined
        ? budgetReadService.observeForAccounts(workplaceId, expenseIds, journalDate, today)
        : of([]),
    [workplaceId, expenseIds.join(','), journalDate, today],
    [],
    { keepPreviousData: false },
  );
  const hasError = !!error;
  return useMemo(
    () => ({ budgets: data, error: hasError, onRetry: retry }),
    [data, hasError, retry],
  );
}

export function useJournalHistory(
  journalId: JournalId,
  workplaceId: WorkplaceId,
  transactions: DisplayTransaction[],
) {
  const audit = useObservable(
    () => observeAuditTrail('journal', journalId, workplaceId),
    [journalId, workplaceId],
    [],
    { keepPreviousData: false },
  );
  const historyAccountIds = useMemo(() => journalHistoryAccountIds(audit.data), [audit.data]);
  const { data: historyAccounts } = useObservable(
    () =>
      historyAccountIds.length > 0
        ? accountQueries.observeByIdsWithDeleted(workplaceId, historyAccountIds)
        : of([]),
    [workplaceId, historyAccountIds.join(',')],
    [],
  );
  const events = useMemo(
    () =>
      mapJournalHistory(
        audit.data,
        Object.fromEntries([
          ...historyAccounts.map(account => [
            account.id,
            { name: account.name, currency: account.currencyCode },
          ]),
          ...transactions.map(item => [
            item.accountId,
            { name: item.accountName ?? '', currency: item.currencyCode },
          ]),
        ]),
      ),
    [audit.data, historyAccounts, transactions],
  );
  const hasError = !!audit.error;
  return useMemo(
    () => ({
      events,
      loading: audit.isLoading,
      error: hasError,
      onRetry: audit.retry,
      workplaceId,
    }),
    [events, audit.isLoading, hasError, audit.retry, workplaceId],
  );
}
