import { AppConfig } from '@/src/constants/app-config';
import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { getBalanceImpactMultiplier, JournalLineInput, validateBalance } from '@/src/utils/accountingHelpers';
import { roundToPrecision } from '@/src/utils/money';

export interface JournalValidationResult {
    isValid: boolean;
    imbalance: number;
    totalDebits: number;
    totalCredits: number;
}

export class AccountingService {
    /**
     * Determines the balance impact multiplier for an account/transaction pair.
     */
    getImpactMultiplier(accountType: AccountType, transactionType: TransactionType): number {
        return getBalanceImpactMultiplier(accountType, transactionType);
    }

    /**
     * Alias for getImpactMultiplier to maintain backward compatibility with some services.
     */
    getBalanceImpactMultiplier(accountType: AccountType, transactionType: TransactionType): number {
        return this.getImpactMultiplier(accountType, transactionType);
    }

    /**
     * Validates if a journal's transactions are balanced within the given currency precision.
     */
    validateJournal(transactions: JournalLineInput[], precision: number = AppConfig.constants.precision): JournalValidationResult {
        return validateBalance(transactions, precision);
    }

    /**
     * Calculates what the running balance should be for a transaction given a starting balance.
     */
    calculateNewBalance(currentBalance: number, amount: number, accountType: AccountType, transactionType: TransactionType, precision: number = AppConfig.constants.precision): number {
        const multiplier = this.getImpactMultiplier(accountType, transactionType);
        return roundToPrecision(currentBalance + (amount * multiplier), precision);
    }

    /**
     * Checks if a transaction at a given date is "backdated" relative to the latest transaction for that account.
     */
    isBackdated(transactionDate: number, latestTransactionDate?: number): boolean {
        if (!latestTransactionDate) return false;
        return latestTransactionDate > transactionDate;
    }

    /**
     * Ensures that a journal entry involves at least two distinct accounts.
     */
    validateDistinctAccounts(accountIds: string[]): { isValid: boolean; uniqueCount: number } {
        const uniqueAccounts = new Set(accountIds.filter(id => !!id));
        return {
            isValid: uniqueAccounts.size >= 2,
            uniqueCount: uniqueAccounts.size
        };
    }

    /**
     * Constructs a standard 2-line journal entry for simple UI forms.
     * Follows the 'Value Flow' model:
     * - Destination Account = Entry Point (DEBIT)
     * - Source Account = Exit Point (CREDIT)
     */
    constructSimpleJournal(input: {
        type: 'expense' | 'income' | 'transfer';
        amount: number;
        sourceAccount: { id: string; type: AccountType; rate: number };
        destinationAccount: { id: string; type: AccountType; rate: number };
        description: string;
        date: number;
    }) {
        const { amount, sourceAccount, destinationAccount, description, date } = input;

        // Destination usually gets the DEBIT (Value enters)
        // Source usually gets the CREDIT (Value leaves)
        return {
            journalDate: date,
            description: description,
            transactions: [
                {
                    accountId: destinationAccount.id,
                    amount: amount,
                    transactionType: 'DEBIT' as any,
                    exchangeRate: destinationAccount.rate
                },
                {
                    accountId: sourceAccount.id,
                    amount: amount,
                    transactionType: 'CREDIT' as any,
                    exchangeRate: sourceAccount.rate
                }
            ]
        };
    }
}

export const accountingService = new AccountingService();
