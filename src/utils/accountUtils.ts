/**
 * Account Utilities
 * 
 * Pure utility functions for account operations.
 */

import Account, { AccountType } from '@/src/data/models/Account'

/**
 * Groups accounts by their account type.
 * Returns an object with AccountType keys and arrays of accounts as values.
 */
export function groupAccountsByType(accounts: Account[]): Record<AccountType, Account[]> {
    const groups: Record<AccountType, Account[]> = {
        [AccountType.ASSET]: [],
        [AccountType.LIABILITY]: [],
        [AccountType.EQUITY]: [],
        [AccountType.INCOME]: [],
        [AccountType.EXPENSE]: [],
    }

    accounts.forEach(account => {
        const type = account.accountType.toUpperCase() as AccountType
        if (groups[type]) {
            groups[type].push(account)
        }
    })

    return groups
}

/**
 * Returns account type sections in standard display order.
 * Only includes sections that have accounts.
 */
export function getAccountSections(accounts: Account[]): { title: string; data: Account[] }[] {
    const groups = groupAccountsByType(accounts)
    const sections: { title: string; data: Account[] }[] = []

    // Standard order: Asset, Liability, Equity, Income, Expense
    const orderedTypes: { type: AccountType; title: string }[] = [
        { type: AccountType.ASSET, title: 'Assets' },
        { type: AccountType.LIABILITY, title: 'Liabilities' },
        { type: AccountType.INCOME, title: 'Income' },
        { type: AccountType.EXPENSE, title: 'Expenses' },
        { type: AccountType.EQUITY, title: 'Equity' },
    ]

    orderedTypes.forEach(({ type, title }) => {
        if (groups[type].length > 0) {
            // Sort by orderNum (handling potential undefined)
            const sortedData = [...groups[type]].sort((a, b) => (a.orderNum || 0) - (b.orderNum || 0))
            sections.push({ title, data: sortedData })
        }
    })

    return sections
}

/**
 * Maps section title to theme color.
 */
import { ComponentVariant } from '@/src/utils/style-helpers'

/**
 * Maps an account type or section title to a semantic ComponentVariant key.
 */
export function getAccountVariant(typeOrTitle: string): ComponentVariant {
    const normalized = typeOrTitle.toLowerCase();
    switch (normalized) {
        case 'assets':
        case 'asset':
            return 'asset';
        case 'liabilities':
        case 'liability':
            return 'liability';
        case 'equity':
            return 'equity';
        case 'income':
            return 'income';
        case 'expenses':
        case 'expense':
            return 'expense';
        default:
            return 'text';
    }
}

export function getSectionColor(title: string, theme: {
    asset: string;
    liability: string;
    equity: string;
    income: string;
    expense: string;
    text: string;
}): string {
    const variant = getAccountVariant(title);
    switch (variant) {
        case 'asset': return theme.asset;
        case 'liability': return theme.liability;
        case 'equity': return theme.equity;
        case 'income': return theme.income;
        case 'expense': return theme.expense;
        default: return theme.text;
    }
}

/**
 * Maps account type to accent color for card display.
 */
export function getAccountAccentColor(accountType: string, theme: {
    asset: string;
    liability: string;
    equity: string;
    income: string;
    expense: string;
}): string {
    const typeLower = accountType.toLowerCase();
    switch (typeLower) {
        case 'liability': return theme.liability;
        case 'equity': return theme.equity;
        case 'income': return theme.income;
        case 'expense': return theme.expense;
        default: return theme.asset;
    }
}
