import { AccountType } from '@/src/data/models/Account'
import { TransactionType } from '@/src/data/models/Transaction'

/**
 * Validatable transaction partial
 */
export interface JournalLineInput {
    amount: number
    type: TransactionType
    exchangeRate?: number
}

/**
 * Determines if a specific transaction (Debit or Credit) increases or decreases
 * an account's balance based on its type.
 */
export function getBalanceImpactMultiplier(
    accountType: AccountType,
    transactionType: TransactionType
): number {
    switch (accountType) {
        case AccountType.ASSET:
        case AccountType.EXPENSE:
            return transactionType === TransactionType.DEBIT ? 1 : -1
        case AccountType.LIABILITY:
        case AccountType.EQUITY:
        case AccountType.INCOME:
            return transactionType === TransactionType.CREDIT ? 1 : -1
        default:
            return 0
    }
}

/**
 * Determines if a change is an "increase" in the intuitive sense.
 */
export function isIncrease(
    accountType: AccountType,
    transactionType: TransactionType
): boolean {
    return getBalanceImpactMultiplier(accountType, transactionType) > 0
}

/**
 * Validates if a set of journal lines are balanced.
 */
export function validateBalance(lines: JournalLineInput[]): {
    isValid: boolean
    imbalance: number
    totalDebits: number
    totalCredits: number
} {
    const totalDebits = lines
        .filter((l) => l.type === TransactionType.DEBIT)
        .reduce((sum, l) => sum + l.amount * (l.exchangeRate || 1), 0)

    const totalCredits = lines
        .filter((l) => l.type === TransactionType.CREDIT)
        .reduce((sum, l) => sum + l.amount * (l.exchangeRate || 1), 0)

    const imbalance = Math.round((totalDebits - totalCredits) * 100) / 100

    return {
        isValid: Math.abs(imbalance) < 0.01,
        imbalance,
        totalDebits,
        totalCredits,
    }
}
