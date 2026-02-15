/**
 * Reactive Data Hooks for Accounts
 */
import { Animation } from '@/src/constants'
import { AppConfig } from '@/src/constants/app-config'
import { useUI } from '@/src/contexts/UIContext'
import Account, { AccountType } from '@/src/data/models/Account'
import { accountRepository } from '@/src/data/repositories/AccountRepository'
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository'
import { journalRepository } from '@/src/data/repositories/JournalRepository'
import { transactionRepository } from '@/src/data/repositories/TransactionRepository'
import { accountService } from '@/src/features/accounts/services/AccountService'
import { useObservable } from '@/src/hooks/useObservable'
import { balanceService } from '@/src/services/BalanceService'
import { AccountBalance } from '@/src/types/domain'
import { useCallback } from 'react'
import { combineLatest, debounceTime, of, switchMap } from 'rxjs'

/**
 * Hook to reactively get all accounts
 */
export function useAccounts() {
    const { data: accounts, isLoading, version, error } = useObservable(
        () => accountRepository.observeAll(),
        [],
        [] as Account[]
    )
    return { accounts, isLoading, version, error }
}

/**
 * Hook to reactively get accounts by type
 */
export function useAccountsByType(accountType: string) {
    const { data: accounts, isLoading, version, error } = useObservable(
        () => accountRepository.observeByType(accountType),
        [accountType],
        [] as Account[]
    )
    return { accounts, isLoading, version, error }
}

/**
 * Hook to reactively get a single account by ID
 */
export function useAccount(accountId: string | null) {
    const { data: account, isLoading, version, error } = useObservable(
        () => accountId ? accountRepository.observeById(accountId) : of(null),
        [accountId],
        null as Account | null
    )
    return { account, isLoading, version, error }
}

/**
 * Hook to reactively get account balance.
 * Uses PURE REACTIVITY: No async enrichment, no race conditions.
 * Calculates sum in-memory for instant consistency.
 */
export function useAccountBalance(accountId: string | null) {
    const { defaultCurrency } = useUI()
    const { data: balanceData, isLoading, version, error } = useObservable(
        () => {
            if (!accountId) return of(null)

            return combineLatest([
                accountRepository.observeById(accountId),
                transactionRepository.observeActiveWithColumns([
                    'amount',
                    'transaction_type',
                    'transaction_date',
                    'currency_code',
                    'account_id',
                    'exchange_rate',
                    'updated_at'
                ]),
                currencyRepository.observeAll(),
                journalRepository.observeStatusMeta()
            ]).pipe(
                debounceTime(Animation.dataRefreshDebounce),
                switchMap(async ([account]) => {
                    if (!account) return null

                    // Use aggregated balances to support parent accounts
                    const targetCurrency = defaultCurrency || AppConfig.defaultCurrency
                    const balances = await balanceService.getAccountBalances(Date.now(), targetCurrency)
                    return balances.find(b => b.accountId === account.id) || null
                })
            )
        },
        [accountId, defaultCurrency],
        null as AccountBalance | null
    )

    return { balanceData, isLoading, version, error }
}

/**
 * Hook to reactively check if an account has children.
 */
export function useAccountHasChildren(accountId: string | null) {
    const { data: hasChildren, isLoading, version, error } = useObservable(
        () => accountId ? accountRepository.observeHasChildren(accountId) : of(false),
        [accountId],
        false
    )
    return { hasChildren, isLoading, version, error }
}

/**
 * Hook to reactively get the number of sub-accounts for a parent.
 */
export function useAccountSubAccountCount(accountId: string | null) {
    const { data: subAccountCount, isLoading, version, error } = useObservable(
        () => accountId ? accountRepository.observeSubAccountCount(accountId) : of(0),
        [accountId],
        0
    )
    return { subAccountCount, isLoading, version, error }
}

/**
 * Hook to reactively compute balances for a list of accounts.
 * Supports async balance aggregation with currency conversion.
 */
export function useAccountBalances(accounts: Account[]) {
    const { defaultCurrency } = useUI()

    const { data: balancesByAccountId, isLoading, version, error } = useObservable<Map<string, AccountBalance>>(
        () => {
            if (accounts.length === 0) {
                return of(new Map<string, AccountBalance>())
            }

            return combineLatest([
                transactionRepository.observeActiveWithColumns([
                    'amount',
                    'transaction_type',
                    'transaction_date',
                    'currency_code',
                    'account_id',
                    'exchange_rate',
                    'updated_at'
                ]),
                currencyRepository.observeAll(),
                journalRepository.observeStatusMeta()
            ]).pipe(
                debounceTime(Animation.dataRefreshDebounce),
                switchMap(async () => {
                    const targetCurrency = defaultCurrency || AppConfig.defaultCurrency
                    const balances = await balanceService.getAccountBalances(Date.now(), targetCurrency)
                    return new Map(balances.map(b => [b.accountId, b]))
                })
            )
        },
        [accounts, defaultCurrency],
        new Map<string, AccountBalance>()
    )

    return { balancesByAccountId, isLoading, version, error }
}

/**
 * Hook for account actions (mutations)
 * Consolidated: provides CRUD operations and management actions
 */
export function useAccountActions() {
    const createAccount = useCallback(async (data: {
        name: string;
        accountType: AccountType;
        currencyCode: string;
        icon?: string;
        initialBalance?: number;
        parentAccountId?: string | null;
    }) => {
        return accountService.createAccount(data)
    }, [])

    const updateAccount = useCallback(async (account: Account, data: {
        name?: string;
        accountType?: AccountType;
        currencyCode?: string;
        description?: string;
        icon?: string;
        parentAccountId?: string | null;
    }) => {
        return accountService.updateAccount(account.id, data)
    }, [])

    const deleteAccount = useCallback(async (account: Account) => {
        return accountService.deleteAccount(account)
    }, [])

    const recoverAccount = useCallback(async (accountId: string) => {
        return accountService.recoverAccount(accountId)
    }, [])

    const updateAccountOrder = useCallback(async (account: Account, newOrder: number) => {
        return accountService.updateAccountOrder(account, newOrder)
    }, [])

    const findAccountByName = useCallback(async (name: string) => {
        return accountService.findAccountByName(name)
    }, [])

    const adjustBalance = useCallback(async (account: Account, targetBalance: number) => {
        return accountService.adjustBalance(account, targetBalance)
    }, [])

    return {
        createAccount,
        updateAccount,
        deleteAccount,
        recoverAccount,
        updateAccountOrder,
        findAccountByName,
        adjustBalance
    }
}
