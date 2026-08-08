import { reactiveDataService } from '@/src/services/ReactiveDataService';
import { clearReactiveAggregatedBalancesCache } from '@/src/services/reactive/reactiveAggregatedBalances';
import { clearReactiveWorkplaceAccountsAndJournalMetaCache } from '@/src/services/reactive/reactiveWorkplaceObserves';

/** Bust stale shareReplay graphs after archive mutations. */
export function invalidateAccountArchiveCaches(): void {
  reactiveDataService.invalidateAccountCaches();
  clearReactiveWorkplaceAccountsAndJournalMetaCache();
  clearReactiveAggregatedBalancesCache();
}
