import { AppConfig, Palette } from '@/src/constants'
import { Theme } from '@/src/constants/design-tokens'
import Account from '@/src/data/models/Account'
import { getAccountAccentColor, getAccountSections, getSectionColor } from '@/src/utils/accountUtils'
import { getContrastColor } from '@/src/utils/colorUtils'
import { CurrencyFormatter } from '@/src/utils/currencyFormatter'

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

interface BalancesByAccountId {
    balance: number
    monthlyIncome: number
    monthlyExpenses: number
    currencyCode?: string
}

interface TransformOptions {
    balancesByAccountId: Map<string, BalancesByAccountId | null>
    defaultCurrency: string | null
    showAccountMonthlyStats: boolean
    isPrivacyMode: boolean
    isLoading: boolean
    collapsedSections: Set<string>
    theme: Theme
    totalAssets: number
    totalLiabilities: number
    totalEquity: number
    totalIncome: number
    totalExpense: number
    expandedAccountIds: Set<string>
}

export function transformAccountsToSections(
    accounts: Account[],
    options: TransformOptions
): AccountSectionViewModel[] {
    if (!accounts.length) return []

    const {
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
        expandedAccountIds,
    } = options

    const rawSections = getAccountSections(accounts)

    return rawSections.map((section) => {
        const sectionColor = getSectionColor(section.title, {
            asset: theme.asset,
            liability: theme.liability,
            equity: theme.equity,
            income: theme.income,
            expense: theme.expense,
            text: theme.text,
        })

        let sectionTotal = 0
        if (section.title === 'Assets') sectionTotal = totalAssets
        else if (section.title === 'Liabilities') sectionTotal = totalLiabilities
        else if (section.title === 'Equity') sectionTotal = totalEquity
        else if (section.title === 'Income') sectionTotal = totalIncome
        else if (section.title === 'Expenses') sectionTotal = totalExpense

        const totalDisplay = isPrivacyMode
            ? '••••'
            : CurrencyFormatter.formatShort(sectionTotal, defaultCurrency || AppConfig.defaultCurrency)

        const typeAccounts = section.data
        const rootAccounts = typeAccounts.filter(a => !a.parentAccountId || !typeAccounts.find(p => p.id === a.parentAccountId))
        const flattenedData: AccountCardViewModel[] = []

        const flatten = (account: Account, depth: number) => {
            const accentColor = getAccountAccentColor(account.accountType, {
                asset: theme.asset,
                liability: theme.liability,
                equity: theme.equity,
                income: theme.income,
                expense: theme.expense,
            })

            const contrastColor = getContrastColor(accentColor)
            const textColor = contrastColor === 'white' ? Palette.white : Palette.black

            const balanceData = balancesByAccountId.get(account.id) || null
            const balance = balanceData?.balance || 0
            const monthlyIncome = balanceData?.monthlyIncome || 0
            const monthlyExpenses = balanceData?.monthlyExpenses || 0

            const currencyCode = balanceData?.currencyCode || account.currencyCode

            const balanceText = isLoading ? '...' : CurrencyFormatter.format(balance, currencyCode)
            const monthlyIncomeText = isLoading ? '...' : CurrencyFormatter.format(monthlyIncome, currencyCode)
            const monthlyExpenseText = isLoading ? '...' : CurrencyFormatter.format(monthlyExpenses, currencyCode)

            const isExpanded = expandedAccountIds.has(account.id)
            const children = typeAccounts.filter(a => a.parentAccountId === account.id)

            flattenedData.push({
                id: account.id,
                name: account.name,
                icon: account.icon || null,
                accentColor,
                textColor,
                balanceText,
                monthlyIncomeText,
                monthlyExpenseText,
                showMonthlyStats: showAccountMonthlyStats,
                currencyCode: account.currencyCode,
                depth,
                hasChildren: children.length > 0,
                isExpanded,
            })

            if (isExpanded) {
                children.forEach(child => flatten(child, depth + 1))
            }
        }

        rootAccounts.forEach(root => flatten(root, 0))

        return {
            title: section.title,
            count: typeAccounts.length,
            totalDisplay,
            totalColor: sectionColor,
            isCollapsed: collapsedSections.has(section.title),
            data: flattenedData,
        }
    })
}
