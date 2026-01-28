/**
 * Reactive Data Hooks for Accounts
 */
import Account from '@/src/data/models/Account'
import { accountRepository } from '@/src/data/repositories/AccountRepository'
import { useObservable, useObservableWithEnrichment } from '@/src/hooks/useObservable'
import { AccountBalance } from '@/src/types/domain'
import { useMemo } from 'react'
import { of } from 'rxjs'

/**
 * Hook to reactively get all accounts
 */
export function useAccounts() {
    const { data: accounts, isLoading } = useObservable(
        () => accountRepository.observeAll(),
        [],
        [] as Account[]
    )
    return { accounts, isLoading }
}

/**
 * Hook to reactively get accounts by type
 */
export function useAccountsByType(accountType: string) {
    const { data: accounts, isLoading } = useObservable(
        () => accountRepository.observeByType(accountType),
        [accountType],
        [] as Account[]
    )
    return { accounts, isLoading }
}

/**
 * Hook to reactively get a single account by ID
 */
export function useAccount(accountId: string | null) {
    const { data: account, isLoading } = useObservable(
        () => accountId ? accountRepository.observeById(accountId) : of(null),
        [accountId],
        null as Account | null
    )
    return { account, isLoading }
}

/**
 * Hook to reactively get account balance
 */
export function useAccountBalance(accountId: string | null) {
    // Use a stable empty observable when accountId is null
    const stableAccountId = useMemo(() => accountId, [accountId])

    const { data: balanceData, isLoading } = useObservableWithEnrichment(
        () => stableAccountId ? accountRepository.observeBalance(stableAccountId) : of(null),
        async () => stableAccountId ? accountRepository.getAccountBalance(stableAccountId) : null,
        [stableAccountId],
        null as AccountBalance | null
    )
    return { balanceData, isLoading }
}
