import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import {
    getBalanceImpactMultiplier,
    isBalanceIncrease,
    isValueEntering,
    isValueLeaving,
    validateBalance
} from '@/src/utils/accounting-utils';

describe('accounting-utils', () => {
    describe('getBalanceImpactMultiplier', () => {
        it('should return 1 for Asset/Expense Debit', () => {
            expect(getBalanceImpactMultiplier(AccountType.ASSET, TransactionType.DEBIT)).toBe(1);
            expect(getBalanceImpactMultiplier(AccountType.EXPENSE, TransactionType.DEBIT)).toBe(1);
        });

        it('should return -1 for Asset/Expense Credit', () => {
            expect(getBalanceImpactMultiplier(AccountType.ASSET, TransactionType.CREDIT)).toBe(-1);
            expect(getBalanceImpactMultiplier(AccountType.EXPENSE, TransactionType.CREDIT)).toBe(-1);
        });

        it('should return 1 for Liability/Equity/Income Credit', () => {
            expect(getBalanceImpactMultiplier(AccountType.LIABILITY, TransactionType.CREDIT)).toBe(1);
            expect(getBalanceImpactMultiplier(AccountType.EQUITY, TransactionType.CREDIT)).toBe(1);
            expect(getBalanceImpactMultiplier(AccountType.INCOME, TransactionType.CREDIT)).toBe(1);
        });

        it('should return -1 for Liability/Equity/Income Debit', () => {
            expect(getBalanceImpactMultiplier(AccountType.LIABILITY, TransactionType.DEBIT)).toBe(-1);
            expect(getBalanceImpactMultiplier(AccountType.EQUITY, TransactionType.DEBIT)).toBe(-1);
            expect(getBalanceImpactMultiplier(AccountType.INCOME, TransactionType.DEBIT)).toBe(-1);
        });

        it('should return 0 for unknown account type', () => {
            expect(getBalanceImpactMultiplier('UNKNOWN' as any, TransactionType.DEBIT)).toBe(0);
        });
    });

    describe('isBalanceIncrease', () => {
        it('should correctly identify increases', () => {
            expect(isBalanceIncrease(AccountType.ASSET, TransactionType.DEBIT)).toBe(true);
            expect(isBalanceIncrease(AccountType.LIABILITY, TransactionType.CREDIT)).toBe(true);
            expect(isBalanceIncrease(AccountType.ASSET, TransactionType.CREDIT)).toBe(false);
            expect(isBalanceIncrease(AccountType.LIABILITY, TransactionType.DEBIT)).toBe(false);
        });
    });

    describe('Value Direction', () => {
        it('isValueEntering should be true for DEBIT', () => {
            expect(isValueEntering(TransactionType.DEBIT)).toBe(true);
            expect(isValueEntering(TransactionType.CREDIT)).toBe(false);
        });

        it('isValueLeaving should be true for CREDIT', () => {
            expect(isValueLeaving(TransactionType.CREDIT)).toBe(true);
            expect(isValueLeaving(TransactionType.DEBIT)).toBe(false);
        });
    });

    describe('validateBalance', () => {
        it('should validate balanced lines', () => {
            const lines = [
                { amount: 100, type: TransactionType.DEBIT },
                { amount: 100, type: TransactionType.CREDIT },
            ];
            const result = validateBalance(lines);
            expect(result.isValid).toBe(true);
            expect(result.imbalance).toBe(0);
            expect(result.totalDebits).toBe(100);
            expect(result.totalCredits).toBe(100);
        });

        it('should detect unbalanced lines', () => {
            const lines = [
                { amount: 100, type: TransactionType.DEBIT },
                { amount: 90, type: TransactionType.CREDIT },
            ];
            const result = validateBalance(lines);
            expect(result.isValid).toBe(false);
            expect(result.imbalance).toBe(10);
        });

        it('should handle exchange rates', () => {
            const lines = [
                { amount: 100, type: TransactionType.DEBIT, exchangeRate: 1.2 }, // 120
                { amount: 120, type: TransactionType.CREDIT }, // 120
            ];
            const result = validateBalance(lines);
            expect(result.isValid).toBe(true);
            expect(result.totalDebits).toBe(120);
        });

        it('should handle precision-aware imbalance', () => {
            const lines = [
                { amount: 100.001, type: TransactionType.DEBIT },
                { amount: 100, type: TransactionType.CREDIT },
            ];
            // With precision 2, 100.001 - 100 = 0.00 (rounded)
            const result = validateBalance(lines, 2);
            expect(result.isValid).toBe(true);
            expect(result.imbalance).toBe(0);
        });

        it('should respect precision argument for imbalance detection', () => {
            const lines = [
                { amount: 100.01, type: TransactionType.DEBIT },
                { amount: 100, type: TransactionType.CREDIT },
            ];
            // Precision 2: 0.01 is imbalance
            expect(validateBalance(lines, 2).isValid).toBe(false);
            // Precision 1: 0.01 rounds to 0.0
            expect(validateBalance(lines, 1).isValid).toBe(true);
        });
    });
});
