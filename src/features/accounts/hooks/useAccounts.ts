/**
 * Reactive Data Hooks for Accounts
 */
import { IconName } from '@/src/components/core';
import { Animation } from '@/src/constants';
import Account, { AccountSubtype, AccountType } from '@/src/data/models/Account';
import {
  deleteAccount as deleteAccountCommand,
  recoverAccount as recoverAccountCommand,
} from '@/src/services/accounts/accountDeleteCommands';
import { reconcileAccount as reconcileAccountCommand } from '@/src/services/accounts/accountReconcileCommands';
import { accountQueries } from '@/src/services/accounts/accountQueries';
import { adjustAccountBalance } from '@/src/services/accounts/accountAdjustCommands';
import { BalanceChangeCounterparty } from '@/src/services/accounts/balanceChangeClassification';
import { createAccount as createAccountCommand } from '@/src/services/accounts/accountCommands';
import {
  updateAccount as updateAccountCommand,
  updateAccountOrder as updateAccountOrderCommand,
} from '@/src/services/accounts/accountHierarchyCommands';
import { mergeAccounts as mergeAccountsCommand } from '@/src/services/accounts/accountMergeCommands';
import { findAccountByName as findAccountByNameQuery } from '@/src/services/accounts/accountSystemAccounts';
import {
  observeAccountBalance,
  observeActiveTransactions,
} from '@/src/services/accounts/accountReadService';
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository';
import { journalObserveQueries } from '@/src/data/repositories/journal/journalTimelineModule';
import { useObservable } from '@/src/hooks/useObservable';
import { balanceService } from '@/src/services/BalanceService';
import { AccountDashboardData, reactiveDataService } from '@/src/services/ReactiveDataService';
import { AccountBalance, AccountId, WorkplaceId } from '@/src/types/domain';
import { useCallback } from 'react';
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
    [] as Account[],
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
    null as Account | null,
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
 * Hook to reactively check if an account has children.
 */
export function useAccountHasChildren(accountId: AccountId | null, workplaceId: WorkplaceId) {
  const {
    data: hasChildren,
    isLoading,
    version,
    error,
  } = useObservable(
    () =>
      accountId
        ? accountQueries.observeHasChildren(workplaceId, accountId as AccountId)
        : of(false),
    [accountId, workplaceId],
    false,
  );
  return { hasChildren, isLoading, version, error };
}

/**
 * Hook to reactively get the number of sub-accounts for a parent.
 */
export function useAccountSubAccountCount(accountId: AccountId | null, workplaceId: WorkplaceId) {
  const {
    data: subAccountCount,
    isLoading,
    version,
    error,
  } = useObservable(
    () =>
      accountId
        ? accountQueries.observeSubAccountCount(workplaceId, accountId as AccountId)
        : of(0),
    [accountId, workplaceId],
    0,
  );
  return { subAccountCount, isLoading, version, error };
}

/**
 * Hook to reactively compute balances for a list of accounts.
 * Supports async balance aggregation with currency conversion.
 */
export function useAccountBalances(
  workplaceId: WorkplaceId,
  accounts: Account[],
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
        currencyRepository.observeAll(),
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

/**
 * Hook for account actions (mutations)
 * Consolidated: provides CRUD operations and management actions
 */
export function useAccountActions(workplaceId: WorkplaceId) {
  const createAccount = useCallback(
    async (data: {
      name: string;
      accountType: AccountType;
      accountSubtype?: AccountSubtype;
      currencyCode: string;
      icon?: IconName;
      initialBalance?: number;
      parentAccountId?: AccountId | null;
      metadata?: import('@/src/data/repositories/AccountRepository').AccountPersistenceInput['metadata'];
    }) => {
      return createAccountCommand(workplaceId, { ...data, workplaceId });
    },
    [workplaceId],
  );

  const updateAccount = useCallback(
    async (
      account: Account,
      data: {
        name?: string;
        accountType?: AccountType;
        accountSubtype?: AccountSubtype;
        currencyCode?: string;
        description?: string;
        icon?: IconName;
        parentAccountId?: AccountId | null;
        metadata?: import('@/src/data/repositories/AccountRepository').AccountPersistenceInput['metadata'];
      },
    ) => {
      return updateAccountCommand(workplaceId, account.id as AccountId, data);
    },
    [workplaceId],
  );

  const deleteAccount = useCallback(
    async (account: Account) => {
      return deleteAccountCommand(account, workplaceId);
    },
    [workplaceId],
  );

  const recoverAccount = useCallback(
    async (accountId: AccountId) => {
      return recoverAccountCommand(accountId, workplaceId);
    },
    [workplaceId],
  );

  const updateAccountOrder = useCallback(
    async (account: Account, newOrder: number) => {
      return updateAccountOrderCommand(workplaceId, account, newOrder);
    },
    [workplaceId],
  );

  const findAccountByName = useCallback(
    async (name: string) => {
      return findAccountByNameQuery(workplaceId, name);
    },
    [workplaceId],
  );

  const adjustBalance = useCallback(
    async (account: Account, targetBalance: number, counterparty?: BalanceChangeCounterparty) => {
      return adjustAccountBalance(workplaceId, account, targetBalance, counterparty);
    },
    [workplaceId],
  );

  const reconcileAccount = useCallback(
    async (accountId: AccountId, date: Date) => {
      return reconcileAccountCommand(accountId, date, workplaceId);
    },
    [workplaceId],
  );

  const mergeAccounts = useCallback(
    async (targetAccountId: AccountId, sourceAccountIds: AccountId[]) => {
      return mergeAccountsCommand(workplaceId, targetAccountId, sourceAccountIds);
    },
    [workplaceId],
  );

  return {
    createAccount,
    updateAccount,
    deleteAccount,
    recoverAccount,
    updateAccountOrder,
    findAccountByName,
    adjustBalance,
    reconcileAccount,
    mergeAccounts,
  };
}

/**
 * Optimized hook for account details/dashboard.
 * Uses the high-performance raw SQL + consolidated optimization from ReactiveDataService.
 */
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
