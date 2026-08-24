/**
 * Account details composite read — account row + balance + sub-accounts.
 * Backed by ReactiveDataService (not accountDerivedReads). See docs/ACCOUNTS.md.
 */
import { useObservable } from '@/src/hooks/useObservable';
import { AccountDashboardData, reactiveDataService } from '@/src/services/ReactiveDataService';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { of } from 'rxjs';

export function useAccountDashboard(
  workplaceId: WorkplaceId,
  accountId: AccountId | null,
  currencyCode: string,
) {
  const targetCurrency = currencyCode;

  const { data, isLoading, version, error } = useObservable(
    () =>
      accountId && workplaceId
        ? reactiveDataService.observeAccountDashboard(accountId, targetCurrency, workplaceId)
        : of(null),
    [accountId, targetCurrency, workplaceId],
    null as AccountDashboardData | null,
  );

  return {
    account: data?.account || null,
    balanceData: data?.balance || null,
    subAccounts: data?.subAccounts || [],
    allAccounts: data?.allAccounts || [],
    isLoading,
    version,
    error,
  };
}
