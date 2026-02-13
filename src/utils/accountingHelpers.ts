import { AppConfig } from '@/src/constants/app-config';
import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { roundToPrecision } from '@/src/utils/money';

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
 * Determines if a change is an "increase" in the account's balance.
 * (e.g. Asset Debit is an increase, Liability Credit is an increase)
 */
export function isBalanceIncrease(
    accountType: AccountType,
    transactionType: TransactionType
): boolean {
    return getBalanceImpactMultiplier(accountType, transactionType) > 0
}

/**
 * Determines if a transaction represents value ENTERING an account (Destination).
 * This follows the "Value Flow" model where DEBIT = IN and CREDIT = OUT.
 */
export function isValueEntering(transactionType: TransactionType): boolean {
    return transactionType === TransactionType.DEBIT
}

/**
 * Determines if a transaction represents value LEAVING an account (Source).
 */
export function isValueLeaving(transactionType: TransactionType): boolean {
    return transactionType === TransactionType.CREDIT
}

// Deprecated: Use isBalanceIncrease for clarity
export const isIncrease = isBalanceIncrease

/**
 * Validates if a set of journal lines are balanced.
 * @param lines Journal lines to validate
 * @param precision Precision of the journal currency (default 2)
 */
export function validateBalance(lines: JournalLineInput[], precision: number = AppConfig.constants.precision): {
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

    const imbalance = roundToPrecision(totalDebits - totalCredits, precision);

    return {
        isValid: Math.abs(imbalance) < Math.pow(10, -(precision + 1)), // Use precision-aware epsilon
        imbalance,
        totalDebits: roundToPrecision(totalDebits, precision),
        totalCredits: roundToPrecision(totalCredits, precision),
    }
}
