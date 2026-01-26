import { AccountType } from '../data/models/Account';
import { TransactionType } from '../data/models/Transaction';
import { JournalLineInput } from './accounting/JournalCalculator';

/**
 * AccountingService - Centralized domain logic for the accounting system.
 * 
 * This service handles the business rules for how transactions impact balances,
 * how journals are constructed from simple UI inputs, and ensures all operations
 * follow double-entry principles.
 */
export class AccountingService {
    /**
     * Determines if a specific transaction (Debit or Credit) increases or decreases
     * an account's balance based on its type.
     * 
     * In accounting:
     * - Assets/Expenses: Debits increase (+), Credits decrease (-)
     * - Liabilities/Equity/Income: Credits increase (+), Debits decrease (-)
     */
    getBalanceImpactMultiplier(accountType: AccountType, transactionType: TransactionType): number {
        switch (accountType) {
            case AccountType.ASSET:
            case AccountType.EXPENSE:
                return transactionType === TransactionType.DEBIT ? 1 : -1;
            case AccountType.LIABILITY:
            case AccountType.EQUITY:
            case AccountType.INCOME:
                return transactionType === TransactionType.CREDIT ? 1 : -1;
            default:
                return 0;
        }
    }

    /**
     * Determines if a change is an "increase" in the intuitive sense (e.g. more money in asset, more debt in liability).
     * Useful for UI coloring (Income/Expense indicators).
     */
    isIncrease(accountType: AccountType, transactionType: TransactionType): boolean {
        return this.getBalanceImpactMultiplier(accountType, transactionType) > 0;
    }

    /**
     * Helper to determine appropriate TransactionType (DEBIT/CREDIT) for a specific account
     * when we want to "increase" or "decrease" its balance.
     */
    getTransactionTypeForAction(accountType: AccountType, action: 'increase' | 'decrease'): TransactionType {
        const isDebitIncrease = [AccountType.ASSET, AccountType.EXPENSE].includes(accountType);

        if (action === 'increase') {
            return isDebitIncrease ? TransactionType.DEBIT : TransactionType.CREDIT;
        } else {
            return isDebitIncrease ? TransactionType.CREDIT : TransactionType.DEBIT;
        }
    }

    /**
     * Constructs the standard transactional data for a simple entry (Expense/Income/Transfer).
     */
    constructSimpleJournal(params: {
        type: 'expense' | 'income' | 'transfer';
        amount: number;
        sourceAccount: { id: string; type: AccountType; rate: number };
        destinationAccount: { id: string; type: AccountType; rate: number };
        description?: string;
        date?: number;
    }) {
        const { amount, sourceAccount, destinationAccount, description, date } = params;

        const transactions = [
            {
                accountId: destinationAccount.id,
                amount: amount, // Logic for transfer conversion should happen before service call if needed, 
                // or we pass explicit amounts.
                transactionType: TransactionType.DEBIT,
                exchangeRate: destinationAccount.rate
            },
            {
                accountId: sourceAccount.id,
                amount: amount,
                transactionType: TransactionType.CREDIT,
                exchangeRate: sourceAccount.rate
            }
        ];

        return {
            journalDate: date || Date.now(),
            description,
            transactions
        };
    }

    /**
     * Validates if a set of journal lines are balanced.
     */
    validateBalance(lines: JournalLineInput[]): { isValid: boolean; imbalance: number; totalDebits: number; totalCredits: number } {
        const totalDebits = lines
            .filter(l => l.type === TransactionType.DEBIT)
            .reduce((sum, l) => sum + (l.amount * (l.exchangeRate || 1)), 0);

        const totalCredits = lines
            .filter(l => l.type === TransactionType.CREDIT)
            .reduce((sum, l) => sum + (l.amount * (l.exchangeRate || 1)), 0);

        // Use a small epsilon for floating point currency comparison if needed, 
        // though we prefer integer math for base amounts.
        const imbalance = Math.round((totalDebits - totalCredits) * 100) / 100;

        return {
            isValid: Math.abs(imbalance) < 0.01,
            imbalance,
            totalDebits,
            totalCredits
        };
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
}

export const accountingService = new AccountingService();
