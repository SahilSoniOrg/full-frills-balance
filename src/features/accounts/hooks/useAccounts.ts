/**
 * Reactive read hooks for accounts (entity observe + targeted balance).
 * Mutations: `useAccountActions`. Details composite: `useAccountDashboard`.
 */
import { Animation } from '@/src/constants';
import { accountQueries } from '@/src/services/accounts/accountQueries';
import {
  observeAccountBalance,
  observeActiveTransactions,
} from '@/src/services/accounts/accountDerivedReads';
import { journalObserveQueries } from '@/src/data/repositories/journal/journalTimelineModule';
import { useObservable } from '@/src/hooks/useObservable';
import { balanceService } from '@/src/services/BalanceService';
import { currencyReadService } from '@/src/services/currency-read-service';
import { AccountBalance, AccountId, PlainAccount, WorkplaceId } from '@/src/types/domain';
import { combineLatest, of, switchMap } from 'rxjs';
import { firstFastDebounce } from '@/src/utils/rxjs-operators';
/**
 * Hook to reactively get all accounts
 * @param loadData Optional flag to delay fetching (useful for performance optimization)
 */
export function useAccounts(workplaceId: WorkplaceId, loadData: boolean = true) {
  const {
    data: accounts,
    isLoading,
    version,
    error,
  } = useObservable(
    () => (loadData && workplaceId ? accountQueries.observeAll(workplaceId) : of([])),
    [loadData, workplaceId],
    [] as PlainAccount[],
  );
  return { accounts, isLoading, version, error };
}

/**
 * Hook to reactively get a single account by ID
 */
export function useAccount(accountId: AccountId | null, workplaceId: WorkplaceId) {
  const {
    data: account,
    isLoading,
    version,
    error,
  } = useObservable(
    () => (accountId ? accountQueries.observeById(workplaceId, accountId) : of(null)),
    [accountId, workplaceId],
    null as PlainAccount | null,
  );
  return { account, isLoading, version, error };
}

/**
 * Hook to reactively get account balance for a single account.
 * Uses targeted observeAccountBalance (not workplace-wide getAccountBalances).
 */
export function useAccountBalance(
  workplaceId: WorkplaceId,
  accountId: AccountId | null,
  _currencyCode: string,
) {
  const {
    data: balanceData,
    isLoading,
    version,
    error,
  } = useObservable(
    () => observeAccountBalance(workplaceId, accountId),
    [accountId, workplaceId],
    null as AccountBalance | null,
  );

  return { balanceData, isLoading, version, error };
}

/**
 * Hook to reactively compute balances for a list of accounts.
 * Supports async balance aggregation with currency conversion.
 */
export function useAccountBalances(
  workplaceId: WorkplaceId,
  accounts: PlainAccount[],
  currencyCode: string,
) {
  const {
    data: balancesByAccountId,
    isLoading,
    version,
    error,
  } = useObservable<Map<string, AccountBalance>>(
    () => {
      if (accounts.length === 0 || !workplaceId) {
        return of(new Map<string, AccountBalance>());
      }

      return combineLatest([
        observeActiveTransactions(workplaceId, [
          'amount',
          'transaction_type',
          'transaction_date',
          'currency_code',
          'account_id',
          'exchange_rate',
          'updated_at',
        ]),
        currencyReadService.observeAll(),
        journalObserveQueries.observeStatusMeta(workplaceId),
      ]).pipe(
        firstFastDebounce(Animation.dataRefreshDebounce),
        switchMap(async () => {
          const targetCurrency = currencyCode;
          const balances = await balanceService.getAccountBalances(
            workplaceId,
            undefined,
            targetCurrency,
          );
          return new Map(balances.map(b => [b.accountId, b]));
        }),
      );
    },
    [accounts, currencyCode, workplaceId],
    new Map<string, AccountBalance>(),
  );

  return { balancesByAccountId, isLoading, version, error };
}
