/**
 * Account Utilities
 * 
 * Pure utility functions for account operations.
 */

import Account, { AccountType } from '../data/models/Account'

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
export function getAccountSections(accounts: Account[]): Array<{ title: string; data: Account[] }> {
    const groups = groupAccountsByType(accounts)
    const sections: Array<{ title: string; data: Account[] }> = []

    // Standard order: Asset, Liability, Equity, Income, Expense
    const orderedTypes: Array<{ type: AccountType; title: string }> = [
        { type: AccountType.ASSET, title: 'Assets' },
        { type: AccountType.LIABILITY, title: 'Liabilities' },
        { type: AccountType.EQUITY, title: 'Equity' },
        { type: AccountType.INCOME, title: 'Income' },
        { type: AccountType.EXPENSE, title: 'Expenses' },
    ]

    orderedTypes.forEach(({ type, title }) => {
        if (groups[type].length > 0) {
            sections.push({ title, data: groups[type] })
        }
    })

    return sections
}
