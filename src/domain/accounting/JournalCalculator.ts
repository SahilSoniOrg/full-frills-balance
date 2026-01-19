import { TransactionType } from '../../data/models/Transaction';

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
     * Calculates the imbalance (Difference between Debits and Credits).
     * Positive means Debits > Credits (Needs more credits).
     * Negative means Credits > Debits (Needs more debits).
     */
    static calculateImbalance(lines: JournalLineInput[]): number {
        return this.calculateTotalDebits(lines) - this.calculateTotalCredits(lines);
    }
}
