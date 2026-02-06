/**
 * Reactive Data Hooks for Accounts
 */
import Account, { AccountType } from '@/src/data/models/Account'
import Currency from '@/src/data/models/Currency'
import Transaction from '@/src/data/models/Transaction'
import { accountRepository } from '@/src/data/repositories/AccountRepository'
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository'
import { journalRepository } from '@/src/data/repositories/JournalRepository'
import { transactionRepository } from '@/src/data/repositories/TransactionRepository'
import { accountService } from '@/src/features/accounts/services/AccountService'
import { useObservable } from '@/src/hooks/useObservable'
import { balanceService } from '@/src/services/BalanceService'
import { AccountBalance } from '@/src/types/domain'
import { useCallback, useMemo } from 'react'
import { combineLatest, from, map, of, switchMap } from 'rxjs'

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
    const { data: balanceData, isLoading, version, error } = useObservable(
        () => {
            if (!accountId) return of(null)

            return accountRepository.observeById(accountId).pipe(
                switchMap(account => {
                    if (!account) return of(null)

                    return combineLatest([
                        accountRepository.observeTransactionsForBalance(account.id),
                        journalRepository.observeStatusMeta()
                    ]).pipe(
                        map(([transactions]) => transactions),
                        switchMap((transactions: Transaction[]) =>
                            from(currencyRepository.getPrecision(account.currencyCode)).pipe(
                                map((precision) => {
                                    return balanceService.calculateAccountBalanceFromTransactions(
                                        account,
                                        transactions,
                                        precision
                                    )
                                })
                            )
                        )
                    )
                })
            )
        },
        [accountId],
        null as AccountBalance | null
    )

    return { balanceData, isLoading, version, error }
}

/**
 * Hook to reactively compute balances for a list of accounts.
 * Uses a single transaction subscription to avoid N+1 observers.
 */
export function useAccountBalances(accounts: Account[]) {
    const { data: currencies, isLoading: currenciesLoading, error: currenciesError } = useObservable(
        () => currencyRepository.observeAll(),
        [],
        [] as Currency[]
    )

    const { data: transactions, isLoading: transactionsLoading, error: transactionsError } = useObservable(
        () => combineLatest([
            transactionRepository.observeActiveWithColumns([
                'amount',
                'transaction_type',
                'transaction_date',
                'account_id',
                'deleted_at',
            ]),
            journalRepository.observeStatusMeta()
        ]).pipe(map(([txs]) => txs)),
        [],
        [] as Transaction[]
    )

    const balancesByAccountId = useMemo(() => {
        if (!accounts.length) return new Map<string, AccountBalance>()
        const precisionMap = new Map(currencies.map((currency) => [currency.code, currency.precision]))
        return balanceService.calculateBalancesFromTransactions(accounts, transactions, precisionMap)
    }, [accounts, currencies, transactions])

    const error = currenciesError ?? transactionsError

    return {
        balancesByAccountId,
        isLoading: currenciesLoading || transactionsLoading,
        error
    }
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
    }) => {
        return accountService.createAccount(data)
    }, [])

    const updateAccount = useCallback(async (account: Account, data: {
        name?: string;
        accountType?: AccountType;
        currencyCode?: string;
        description?: string;
        icon?: string;
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
