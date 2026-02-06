import { AppConfig, Palette } from '@/src/constants'
import { getAccountAccentColor, getAccountSections, getSectionColor } from '@/src/utils/accountUtils'
import { getContrastColor } from '@/src/utils/colorUtils'
import { CurrencyFormatter } from '@/src/utils/currencyFormatter'
import Account from '@/src/data/models/Account'
import { Theme } from '@/src/constants/design-tokens'

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

        const data = section.data.map((account: Account) => {
            const accentColor = getAccountAccentColor(account.accountType, {
                asset: theme.asset,
                liability: theme.liability,
                equity: theme.equity,
                income: theme.income,
                expense: theme.expense,
            })

            const contrastColor = getContrastColor(accentColor)
            const textColor = contrastColor === 'white' ? Palette.pureWhite : Palette.trueBlack

            const balanceData = balancesByAccountId.get(account.id) || null
            const balance = balanceData?.balance || 0
            const monthlyIncome = balanceData?.monthlyIncome || 0
            const monthlyExpenses = balanceData?.monthlyExpenses || 0

            const balanceText = isLoading ? '...' : CurrencyFormatter.format(balance, account.currencyCode)
            const monthlyIncomeText = isLoading ? '...' : CurrencyFormatter.format(monthlyIncome, account.currencyCode)
            const monthlyExpenseText = isLoading ? '...' : CurrencyFormatter.format(monthlyExpenses, account.currencyCode)

            return {
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
            }
        })

        return {
            title: section.title,
            count: section.data.length,
            totalDisplay,
            totalColor: sectionColor,
            isCollapsed: collapsedSections.has(section.title),
            data,
        }
    })
}
