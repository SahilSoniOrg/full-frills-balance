import { AppConfig } from '@/constants';
import { TransactionType } from '@/src/data/models/Transaction';
import { preferences } from '@/src/utils/preferences';
import { sanitizeAmount } from '@/src/utils/validation';

export interface JournalLineInput {
    amount: number; // Integer minor units (e.g. cents)
    type: TransactionType;
    exchangeRate?: number; // Optional: for multi-currency transactions
}

export class JournalCalculator {
    /**
     * Calculates the total debits from a list of lines.
     */
    static calculateTotalDebits(lines: JournalLineInput[]): number {
        return lines
            .filter((l) => l.type === 'DEBIT')
            .reduce((sum, l) => sum + l.amount, 0);
    }

    /**
     * Calculates the total credits from a list of lines.
     */
    static calculateTotalCredits(lines: JournalLineInput[]): number {
        return lines
            .filter((l) => l.type === 'CREDIT')
            .reduce((sum, l) => sum + l.amount, 0);
    }

    /**
     * Checks if the journal is balanced.
     */
    static isBalanced(lines: JournalLineInput[]): boolean {
        const debits = this.calculateTotalDebits(lines);
        const credits = this.calculateTotalCredits(lines);
        return debits === credits;
    }

    /**
     * Calculates the base amount for a journal line, considering exchange rates.
     * Follows Rule 11 (Business rules in services).
     */
    static getLineBaseAmount(line: { amount: string | number; exchangeRate?: string | number; accountCurrency?: string; }): number {
        const amount = typeof line.amount === 'string' ? sanitizeAmount(line.amount) : line.amount;
        const finalAmount = amount || 0;
        const rateStr = line.exchangeRate?.toString() || '1';
        const rate = parseFloat(rateStr) || 1;
        const defaultCurrency = preferences.defaultCurrencyCode || AppConfig.defaultCurrency;

        if (!line.accountCurrency || line.accountCurrency === defaultCurrency) {
            return finalAmount;
        }
        const baseAmount = finalAmount * rate;
        // Business rule: round to 2 decimal places if not using integer cents here, 
        // but ideally we should be using minor units everywhere.
        return Math.round(baseAmount * 100) / 100;
    }

    /**
     * Calculates the imbalance (Difference between Debits and Credits).
     * Positive means Debits > Credits (Needs more credits).
     * Negative means Credits > Debits (Needs more debits).
     */
    static calculateImbalance(lines: JournalLineInput[]): number {
        return this.calculateTotalDebits(lines) - this.calculateTotalCredits(lines);
    }
}
