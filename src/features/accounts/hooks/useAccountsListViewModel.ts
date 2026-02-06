import { useUI } from '@/src/contexts/UIContext'
import { useWealthSummary } from '@/src/features/wealth'
import { useTheme } from '@/src/hooks/use-theme'
import { transformAccountsToSections } from '@/src/features/accounts/utils/transformAccounts'
import { useRouter } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'

export interface AccountSectionViewModel {
    title: string
    count: number
    totalDisplay: string
    totalColor: string
    isCollapsed: boolean
    data: any[]
}

export interface AccountsListViewModel {
    sections: AccountSectionViewModel[]
    isRefreshing: boolean
    onRefresh: () => void
    onToggleSection: (title: string) => void
    onAccountPress: (accountId: string) => void
    onCreateAccount: () => void
    onReorderPress: () => void
    onTogglePrivacy: () => void
    isPrivacyMode: boolean
}

export function useAccountsListViewModel(): AccountsListViewModel {
    const router = useRouter()
    const { theme } = useTheme()
    const { defaultCurrency, showAccountMonthlyStats, isPrivacyMode, setPrivacyMode } = useUI()

    const {
        accounts,
        balancesMap: balancesByAccountId,
        totalAssets,
        totalLiabilities,
        totalEquity,
        totalIncome,
        totalExpense,
        isLoading,
    } = useWealthSummary()
    const togglePrivacyMode = useCallback(() => setPrivacyMode(!isPrivacyMode), [isPrivacyMode, setPrivacyMode])

    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set(['Equity']))

    const onToggleSection = useCallback((title: string) => {
        setCollapsedSections(prev => {
            const next = new Set(prev)
            if (next.has(title)) next.delete(title)
            else next.add(title)
            return next
        })
    }, [])

    const onAccountPress = useCallback((accountId: string) => {
        router.push(`/account-details?accountId=${accountId}`)
    }, [router])

    const onCreateAccount = useCallback(() => {
        router.push('/account-creation')
    }, [router])

    const onReorderPress = useCallback(() => {
        router.push('/account-reorder')
    }, [router])

    const onTogglePrivacy = useCallback(() => {
        togglePrivacyMode()
    }, [togglePrivacyMode])

    const onRefresh = useCallback(() => { }, [])

    const sections = useMemo(() => {
        return transformAccountsToSections(accounts, {
            balancesByAccountId,
            defaultCurrency,
            showAccountMonthlyStats,
            isPrivacyMode,
            isLoading,
            collapsedSections,
            theme,
            totalAssets,
            totalLiabilities,
            totalEquity,
            totalIncome,
            totalExpense,
        })
    }, [
        accounts,
        balancesByAccountId,
        defaultCurrency,
        showAccountMonthlyStats,
        isPrivacyMode,
        isLoading,
        collapsedSections,
        theme,
        totalAssets,
        totalLiabilities,
        totalEquity,
        totalIncome,
        totalExpense,
    ])

    return {
        sections,
        isRefreshing: isLoading,
        onRefresh,
        onToggleSection,
        onAccountPress,
        onCreateAccount,
        onReorderPress,
        onTogglePrivacy,
        isPrivacyMode,
    }
}
