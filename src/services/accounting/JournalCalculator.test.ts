import { TransactionType } from '../../data/models/Transaction';
import { JournalCalculator } from './JournalCalculator';

describe('JournalCalculator', () => {
    const debit100 = { amount: 100, type: TransactionType.DEBIT };
    const credit100 = { amount: 100, type: TransactionType.CREDIT };
    const debit50 = { amount: 50, type: TransactionType.DEBIT };
    const credit50 = { amount: 50, type: TransactionType.CREDIT };

    it('calculates total debits correctly', () => {
        const lines = [debit100, credit50, debit50];
        expect(JournalCalculator.calculateTotalDebits(lines)).toBe(150);
    });

    it('calculates total credits correctly', () => {
        const lines = [debit100, credit100, credit50];
        expect(JournalCalculator.calculateTotalCredits(lines)).toBe(150);
    });

    it('identifies balanced journals', () => {
        const lines = [debit100, credit100];
        expect(JournalCalculator.isBalanced(lines)).toBe(true);
    });

    it('identifies unbalanced journals', () => {
        const lines = [debit100, credit50];
        expect(JournalCalculator.isBalanced(lines)).toBe(false);
    });

    it('calculates imbalance correctly', () => {
        // 100 Debit vs 50 Credit = 50 diff
        expect(JournalCalculator.calculateImbalance([debit100, credit50])).toBe(50);

        // 50 Debit vs 100 Credit = -50 diff
        expect(JournalCalculator.calculateImbalance([debit50, credit100])).toBe(-50);
    });
});
