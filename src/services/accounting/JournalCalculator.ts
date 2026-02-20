import { AppConfig } from '@/src/constants';
import { TransactionType } from '@/src/data/models/Transaction';
import { preferences } from '@/src/utils/preferences';
import { sanitizeAmount } from '@/src/utils/validation';

export interface JournalLineInput {
    amount: number | string;
    type: TransactionType;
    exchangeRate?: number | string;
    accountCurrency?: string;
}

/**
 * Standard rounding for financial amounts (2 decimal places).
 * Uses EPSILON to avoid floating point precision errors.
 */
function roundAmount(amount: number): number {
    return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export class JournalCalculator {
    /**
     * Calculates the total debits from a list of lines.
     */
    static calculateTotalDebits(lines: JournalLineInput[]): number {
        return lines
            .filter((l) => l.type === 'DEBIT')
            .reduce((sum, l) => sum + JournalCalculator.getLineBaseAmount({
                amount: l.amount,
                exchangeRate: l.exchangeRate,
                accountCurrency: l.accountCurrency
            }), 0);
    }

    /**
     * Calculates the total credits from a list of lines.
     */
    static calculateTotalCredits(lines: JournalLineInput[]): number {
        return lines
            .filter((l) => l.type === 'CREDIT')
            .reduce((sum, l) => sum + JournalCalculator.getLineBaseAmount({
                amount: l.amount,
                exchangeRate: l.exchangeRate,
                accountCurrency: l.accountCurrency
            }), 0);
    }

    /**
     * Checks if the journal is balanced.
     */
    static isBalanced(lines: JournalLineInput[]): boolean {
        const debits = JournalCalculator.calculateTotalDebits(lines);
        const credits = JournalCalculator.calculateTotalCredits(lines);
        return debits === credits;
    }

    /**
     * Calculates the base amount for a journal line, considering exchange rates.
     * Follows Rule 11 (Business rules in services).
     */
    static getLineBaseAmount(line: { amount: string | number; exchangeRate?: string | number; accountCurrency?: string; }): number {
        if (line.amount == null) {
            return 0;
        }

        let amount: number;
        if (typeof line.amount === 'string') {
            const sanitized = sanitizeAmount(line.amount);
            if (sanitized === null || isNaN(sanitized)) {
                return 0;
            }
            amount = sanitized;
        } else {
            amount = line.amount;
        }

        const finalAmount = amount || 0;

        let rate = 1;
        if (line.exchangeRate != null) {
            const rateStr = line.exchangeRate.toString();
            const parsedRate = parseFloat(rateStr);
            if (!isNaN(parsedRate) && parsedRate > 0) {
                rate = parsedRate;
            }
        }

        const defaultCurrency = preferences.defaultCurrencyCode || AppConfig.defaultCurrency;

        if (!line.accountCurrency || line.accountCurrency === defaultCurrency) {
            return finalAmount;
        }

        const baseAmount = finalAmount * rate;
        return roundAmount(baseAmount);
    }

    /**
     * Standard rounding for financial amounts (2 decimal places).
     */
    static roundAmount(amount: number): number {
        return roundAmount(amount);
    }

    /**
     * Calculates the imbalance (Difference between Debits and Credits).
     * Positive means Debits > Credits (Needs more credits).
     * Negative means Credits > Debits (Needs more debits).
     */
    /**
     * Calculates the imbalance (Difference between Debits and Credits) in base currency.
     * Positive means Debits > Credits (Needs more credits).
     * Negative means Credits > Debits (Needs more debits).
     */
    static calculateImbalance(lines: JournalLineInput[]): number {
        return JournalCalculator.calculateTotalDebits(lines) - JournalCalculator.calculateTotalCredits(lines);
    }

    /**
     * Finds the missing functional value needed to balance the journal.
     */
    static calculateMissingValue(lines: JournalLineInput[]): number {
        const imbalance = JournalCalculator.calculateImbalance(lines);
        return roundAmount(imbalance);
    }

    /**
     * Infers the exchange rate required to reach a specific target base value.
     */
    static calculateImpliedRate(nominalAmount: number, targetBaseAmount: number): number {
        if (nominalAmount === 0) return 1;
        // Rate = Base / Nominal
        // e.g. 1000 ETB / 6.47 USD = 154.559...
        return Math.abs(targetBaseAmount / nominalAmount);
    }

    /**
     * Groups journal lines by their account currency to detect shared non-base currencies.
     */
    static identifyCurrencyGroups(lines: any[]): Record<string, number[]> {
        const groups: Record<string, number[]> = {};
        lines.forEach((line, index) => {
            const currency = line.accountCurrency || preferences.defaultCurrencyCode || AppConfig.defaultCurrency;
            if (!groups[currency]) {
                groups[currency] = [];
            }
            groups[currency].push(index);
        });
        return groups;
    }
}
