import { TransactionType } from '../../data/models/Transaction';
import { JournalLineInput } from './JournalCalculator';
import { JournalValidator } from './JournalValidator';

describe('JournalValidator', () => {
    const debit100: JournalLineInput = { amount: 100, type: TransactionType.DEBIT };
    const credit100: JournalLineInput = { amount: 100, type: TransactionType.CREDIT };
    const credit50: JournalLineInput = { amount: 50, type: TransactionType.CREDIT };

    it('validates a correct journal', () => {
        const lines = [debit100, credit100];
        const result = JournalValidator.validate(lines);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('fails with fewer than 2 lines', () => {
        const lines = [debit100];
        const result = JournalValidator.validate(lines);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Journal must have at least 2 lines');
        // Also fails balance check, but that's expected
    });

    it('fails with zero amounts', () => {
        const zeroLine: JournalLineInput = { amount: 0, type: TransactionType.DEBIT };
        const lines = [zeroLine, credit100]; // Unbalanced and zero
        const result = JournalValidator.validate(lines);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Lines cannot have zero amount');
    });

    it('fails when unbalanced', () => {
        const lines = [debit100, credit50];
        const result = JournalValidator.validate(lines);
        expect(result.isValid).toBe(false);
        expect(result.errors.find(e => e.includes('balanced'))).toBeTruthy();
    });
});
