import { AppConfig } from '@/src/constants/app-config'
import { useUI } from '@/src/contexts/UIContext'
import Account from '@/src/data/models/Account'
import { transformAccountsToSections } from '@/src/features/accounts/utils/transformAccounts'
import { useTheme } from '@/src/hooks/use-theme'
import { useObservable } from '@/src/hooks/useObservable'
import { reactiveDataService } from '@/src/services/ReactiveDataService'
import { useRouter } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'

export interface AccountCardViewModel {
    id: string
    name: string
    icon: string | null
    accentColor: string
    textColor: string
    balanceText: string
    monthlyIncomeText: string
    monthlyExpenseText: string
    showMonthlyStats: boolean
    currencyCode: string
    depth: number
    hasChildren: boolean
    isExpanded: boolean
}

export interface AccountSectionViewModel {
    title: string
    count: number
    totalDisplay: string
    totalColor: string
    isCollapsed: boolean
    data: AccountCardViewModel[]
}

export interface AccountsListViewModel {
    sections: AccountSectionViewModel[]
    isRefreshing: boolean
    onRefresh: () => void
    onToggleSection: (title: string) => void
    onAccountPress: (accountId: string) => void
    onCollapseAccount: (accountId: string) => void
    onCreateAccount: () => void
    onReorderPress: () => void
    onManageHierarchy: () => void
    onTogglePrivacy: () => void
    isPrivacyMode: boolean
    isLoading: boolean
    version: number
}

export function useAccountsListViewModel(): AccountsListViewModel {
    const router = useRouter()
    const { theme } = useTheme()
    const { defaultCurrency, showAccountMonthlyStats, isPrivacyMode, setPrivacyMode } = useUI()

    const targetCurrency = defaultCurrency || AppConfig.defaultCurrency

    const { data: dashboardData, isLoading, version } = useObservable(
        () => reactiveDataService.observeOptimizedAccountList(targetCurrency),
        [targetCurrency],
        {
            accounts: [],
            balances: [],
            wealthSummary: {
                netWorth: 0,
                totalAssets: 0,
                totalLiabilities: 0,
                totalEquity: 0,
                totalIncome: 0,
                totalExpense: 0,
            },
        }
    )

    const accounts = dashboardData.accounts

    const balancesByAccountId = useMemo(() =>
        new Map(dashboardData.balances.map(b => [b.accountId, b])),
        [dashboardData.balances])

    const {
        totalAssets,
        totalLiabilities,
        totalEquity,
        totalIncome,
        totalExpense,
    } = dashboardData.wealthSummary

    const togglePrivacyMode = useCallback(() => setPrivacyMode(!isPrivacyMode), [isPrivacyMode, setPrivacyMode])

    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set(['Equity']))
    const [expandedAccountIds, setExpandedAccountIds] = useState<Set<string>>(new Set())

    const onToggleSection = useCallback((title: string) => {
        setCollapsedSections(prev => {
            const next = new Set(prev)
            if (next.has(title)) next.delete(title)
            else next.add(title)
            return next
        })
    }, [])

    const onAccountPress = useCallback((accountId: string) => {
        const account = accounts.find((a: Account) => a.id === accountId)
        if (!account) return

        const hasChildren = accounts.some((a: Account) => a.parentAccountId === accountId)
        const isExpanded = expandedAccountIds.has(accountId)

        if (hasChildren && !isExpanded) {
            setExpandedAccountIds(prev => {
                const next = new Set(prev)
                next.add(accountId)
                return next
            })
        } else {
            router.push(`/account-details?accountId=${accountId}`)
        }
    }, [router, accounts, expandedAccountIds])

    const onCollapseAccount = useCallback((accountId: string) => {
        setExpandedAccountIds(prev => {
            const next = new Set(prev)
            next.delete(accountId)
            return next
        })
    }, [])

    const onCreateAccount = useCallback(() => {
        router.push('/account-creation')
    }, [router])

    const onReorderPress = useCallback(() => {
        router.push('/account-reorder')
    }, [router])

    const onTogglePrivacy = useCallback(() => {
        togglePrivacyMode()
    }, [togglePrivacyMode])

    const onManageHierarchy = useCallback(() => {
        router.push('/manage-hierarchy')
    }, [router])

    const onRefresh = useCallback(() => {
        // Refresh is handled reactively by observables
    }, [])

    const sections = useMemo(() => {
        return transformAccountsToSections(accounts, {
            balancesByAccountId,
            defaultCurrency,
            showAccountMonthlyStats,
            isPrivacyMode,
            isLoading,
            collapsedSections,
            expandedAccountIds,
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
        expandedAccountIds,
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
        onCollapseAccount,
        onCreateAccount,
        onReorderPress,
        onManageHierarchy,
        onTogglePrivacy,
        isPrivacyMode,
        isLoading,
        version,
    }
}
