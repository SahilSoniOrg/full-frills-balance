/**
 * Reactive Data Hooks for Accounts
 */
import { IconName } from '@/src/components/core';
import { Animation } from '@/src/constants';
import Account, { AccountSubtype, AccountType } from '@/src/data/models/Account';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { accountService } from '@/src/features/accounts/services/AccountService';
import { useObservable } from '@/src/hooks/useObservable';
import { balanceService } from '@/src/services/BalanceService';
import { reactiveDataService } from '@/src/services/ReactiveDataService';
import { AccountBalance, AccountId, WorkplaceId } from '@/src/types/domain';
import { useCallback } from 'react';
import { combineLatest, debounceTime, of, switchMap } from 'rxjs';

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
    () => (loadData && workplaceId ? accountRepository.observeAll(workplaceId) : of([])),
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
    () => (accountId ? accountRepository.observeById(workplaceId, accountId) : of(null)),
    [accountId, workplaceId],
    null as Account | null,
  );
  return { account, isLoading, version, error };
}

/**
 * Hook to reactively get account balance.
 * Uses PURE REACTIVITY: No async enrichment, no race conditions.
 * Calculates sum in-memory for instant consistency.
 */
export function useAccountBalance(
  workplaceId: WorkplaceId,
  accountId: AccountId | null,
  currencyCode: string,
) {
  const {
    data: balanceData,
    isLoading,
    version,
    error,
  } = useObservable(
    () => {
      if (!accountId || !workplaceId) return of(null);

      return combineLatest([
        accountRepository.observeById(workplaceId, accountId),
        transactionRepository.observeActiveWithColumns(workplaceId, [
          'amount',
          'transaction_type',
          'transaction_date',
          'currency_code',
          'account_id',
          'exchange_rate',
          'updated_at',
        ]),
        currencyRepository.observeAll(),
      ]).pipe(
        debounceTime(Animation.dataRefreshDebounce),
        switchMap(async ([account]) => {
          if (!account) return null;

          const targetCurrency = currencyCode;

          // If it's a leaf account (no children), we can just get its direct balance
          // But for consistency with parent accounts, we use the optimized getAccountBalances
          // which is now near-instant thanks to non-blocking exchange rates.
          const balances = await balanceService.getAccountBalances(
            workplaceId,
            undefined,
            targetCurrency,
          );
          return balances.find(b => b.accountId === account.id) || null;
        }),
      );
    },
    [accountId, currencyCode, workplaceId],
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
        ? accountRepository.observeHasChildren(workplaceId, accountId as AccountId)
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
        ? accountRepository.observeSubAccountCount(workplaceId, accountId as AccountId)
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
        transactionRepository.observeActiveWithColumns(workplaceId, [
          'amount',
          'transaction_type',
          'transaction_date',
          'currency_code',
          'account_id',
          'exchange_rate',
          'updated_at',
        ]),
        currencyRepository.observeAll(),
        journalRepository.observeStatusMeta(workplaceId),
      ]).pipe(
        debounceTime(Animation.dataRefreshDebounce),
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
      return accountService.createAccount({ ...data, workplaceId }, workplaceId);
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
      return accountService.updateAccount(account.id as AccountId, data, workplaceId);
    },
    [workplaceId],
  );

  const deleteAccount = useCallback(
    async (account: Account) => {
      return accountService.deleteAccount(account, workplaceId);
    },
    [workplaceId],
  );

  const recoverAccount = useCallback(
    async (accountId: AccountId) => {
      return accountService.recoverAccount(accountId, workplaceId);
    },
    [workplaceId],
  );

  const updateAccountOrder = useCallback(
    async (account: Account, newOrder: number) => {
      return accountService.updateAccountOrder(account, newOrder, workplaceId);
    },
    [workplaceId],
  );

  const findAccountByName = useCallback(
    async (name: string) => {
      return accountService.findAccountByName(workplaceId, name);
    },
    [workplaceId],
  );

  const adjustBalance = useCallback(
    async (account: Account, targetBalance: number) => {
      return accountService.adjustBalance(account, targetBalance, workplaceId);
    },
    [workplaceId],
  );

  const reconcileAccount = useCallback(
    async (accountId: AccountId, date: Date) => {
      return accountService.reconcileAccount(accountId, date, workplaceId);
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
    null as {
      account: Account | null;
      balance: AccountBalance | null;
      subAccounts: AccountBalance[];
      allAccounts: Account[];
    } | null,
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
