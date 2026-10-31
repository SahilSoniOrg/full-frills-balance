import { Animation } from '@/src/constants';
import { accountObserveQueries } from '@/src/data/repositories/account';
import { balanceSnapshotRepository } from '@/src/data/repositories/BalanceSnapshotRepository';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { exchangeRateRepository } from '@/src/data/repositories/ExchangeRateRepository';
import {
  observeWorkplaceAccounts,
  observeWorkplaceActiveTransactionCount,
  observeWorkplaceJournalMeta,
} from '@/src/services/reactive/reactiveWorkplaceObserves';
import type { WorkplaceId } from '@/src/types/ids';
import { combineLatest, defer, map, merge, skip, startWith, type Observable } from 'rxjs';
import { firstFastDebounce } from '@/src/utils/rxjs-operators';

/** Emits when a persisted input used by Reports V2 changes for this workplace. */
export function observeReportInputChanges(workplaceId: WorkplaceId): Observable<void> {
  const workplaceChanges = combineLatest([
    observeWorkplaceAccounts(workplaceId),
    observeWorkplaceJournalMeta(workplaceId),
    observeWorkplaceActiveTransactionCount(workplaceId),
    accountObserveQueries.observeMetadataForWorkplace(workplaceId),
    budgetRepository.observeAllActive(workplaceId),
    budgetRepository.observeAllScopes(workplaceId),
  ]).pipe(
    skip(1),
    map(() => undefined),
  );

  return defer(() =>
    merge(
      workplaceChanges,
      balanceSnapshotRepository.observeChangesForWorkplace(workplaceId),
      // Historical conversion can depend on line→journal and journal→report
      // quotes, so filtering only by the report currency could miss a quote.
      exchangeRateRepository.observeChanges(),
    ).pipe(firstFastDebounce(Animation.dataRefreshDebounce)),
  ).pipe(startWith(undefined));
}
