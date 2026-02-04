/**
 * Reactive Data Hooks for Accounts
 */
import Account, { AccountType } from '@/src/data/models/Account'
import Transaction from '@/src/data/models/Transaction'
import { accountRepository } from '@/src/data/repositories/AccountRepository'
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository'
import { useObservable } from '@/src/hooks/useObservable'
import { AccountService } from '@/src/features/accounts/services/AccountService'
import { AccountBalance } from '@/src/types/domain'
import { accountingService } from '@/src/utils/accountingService'
import { useCallback, useMemo } from 'react'
import { from, map, of, switchMap } from 'rxjs'

// Instantiate service outside hook (assuming singleton pattern)
const accountService = new AccountService()

/**
 * Hook to reactively get all accounts
 */
export function useAccounts() {
    const { data: accounts, isLoading, version } = useObservable(
        () => accountRepository.observeAll(),
        [],
        [] as Account[]
    )
    return { accounts, isLoading, version }
}

/**
 * Hook to reactively get accounts by type
 */
export function useAccountsByType(accountType: string) {
    const { data: accounts, isLoading, version } = useObservable(
        () => accountRepository.observeByType(accountType),
        [accountType],
        [] as Account[]
    )
    return { accounts, isLoading, version }
}

/**
 * Hook to reactively get a single account by ID
 */
export function useAccount(accountId: string | null) {
    const { data: account, isLoading, version } = useObservable(
        () => accountId ? accountRepository.observeById(accountId) : of(null),
        [accountId],
        null as Account | null
    )
    return { account, isLoading, version }
}

/**
 * Hook to reactively get account balance.
 * Uses PURE REACTIVITY: No async enrichment, no race conditions.
 * Calculates sum in-memory for instant consistency.
 */
export function useAccountBalance(accountId: string | null) {
    const query$ = useMemo(() => {
        if (!accountId) return of(null)

        return accountRepository.observeById(accountId).pipe(
            switchMap(account => {
                if (!account) return of(null)

                // Observe all active transactions for this account
                return accountRepository.observeTransactionsForBalance(account.id).pipe(
                    switchMap((transactions: Transaction[]) =>
                        from(currencyRepository.getPrecision(account.currencyCode)).pipe(
                            map((precision) => {
                                let balance = 0
                                for (const tx of transactions) {
                                    balance = accountingService.calculateNewBalance(
                                        balance,
                                        tx.amount,
                                        account.accountType as AccountType,
                                        tx.transactionType as any,
                                        precision
                                    )
                                }

                                return {
                                    accountId: account.id,
                                    balance,
                                    currencyCode: account.currencyCode,
                                    transactionCount: transactions.length,
                                    asOfDate: Date.now(),
                                    accountType: account.accountType as AccountType
                                } as AccountBalance
                            })
                        )
                    )
                )
            })
        )
    }, [accountId])

    const { data: balanceData, isLoading, version } = useObservable(
        () => query$,
        [query$],
        null as AccountBalance | null
    )

    return { balanceData, isLoading, version }
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
        initialBalance?: number;
    }) => {
        return accountService.createAccount(data)
    }, [])

    const updateAccount = useCallback(async (account: Account, data: {
        name?: string;
        accountType?: AccountType;
        currencyCode?: string;
        description?: string;
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

    return {
        createAccount,
        updateAccount,
        deleteAccount,
        recoverAccount,
        updateAccountOrder
    }
}
