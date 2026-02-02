import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { AccountingService } from '@/src/services/AccountingService';

describe('AccountingService', () => {
    let service: AccountingService;

    beforeEach(() => {
        service = new AccountingService();
    });

    describe('Impact Multipliers', () => {
        it('should return correct multiplier for Asset Debit', () => {
            expect(service.getImpactMultiplier(AccountType.ASSET, TransactionType.DEBIT)).toBe(1);
        });

        it('should return correct multiplier for Liability Credit', () => {
            expect(service.getImpactMultiplier(AccountType.LIABILITY, TransactionType.CREDIT)).toBe(1);
        });
    });

    describe('calculateNewBalance', () => {
        it('should correctly calculate increase for Asset Debit', () => {
            // 100 + (50 * 1) = 150
            expect(service.calculateNewBalance(100, 50, AccountType.ASSET, TransactionType.DEBIT)).toBe(150);
        });

        it('should correctly calculate decrease for Asset Credit', () => {
            // 100 + (50 * -1) = 50
            expect(service.calculateNewBalance(100, 50, AccountType.ASSET, TransactionType.CREDIT)).toBe(50);
        });

        it('should handle precision', () => {
            expect(service.calculateNewBalance(100.12, 0.005, AccountType.ASSET, TransactionType.DEBIT, 2)).toBe(100.13);
        });
    });

    describe('isBackdated', () => {
        it('should return false if no latest transaction', () => {
            expect(service.isBackdated(Date.now())).toBe(false);
        });

        it('should return true if current date is before latest', () => {
            const latest = Date.now();
            const current = latest - 1000;
            expect(service.isBackdated(current, latest)).toBe(true);
        });

        it('should return false if current date is after latest', () => {
            const latest = Date.now();
            const current = latest + 1000;
            expect(service.isBackdated(current, latest)).toBe(false);
        });
    });

    describe('validateDistinctAccounts', () => {
        it('should return valid if 2+ accounts', () => {
            expect(service.validateDistinctAccounts(['A', 'B']).isValid).toBe(true);
        });

        it('should return invalid if same account', () => {
            expect(service.validateDistinctAccounts(['A', 'A']).isValid).toBe(false);
        });

        it('should ignore null/undefined', () => {
            expect(service.validateDistinctAccounts(['A', '', undefined] as any).isValid).toBe(false);
        });
    });

    describe('constructSimpleJournal', () => {
        it('should construct a 2-line journal entry', () => {
            const input = {
                type: 'expense' as const,
                amount: 100,
                sourceAccount: { id: 'wallet', type: AccountType.ASSET, rate: 1 },
                destinationAccount: { id: 'food', type: AccountType.EXPENSE, rate: 1 },
                description: 'Lunch',
                date: 123456789
            };

            const journal = service.constructSimpleJournal(input);

            expect(journal.journalDate).toBe(123456789);
            expect(journal.description).toBe('Lunch');
            expect(journal.transactions).toHaveLength(2);

            // Destination (Food) gets Debit
            expect(journal.transactions[0].accountId).toBe('food');
            expect(journal.transactions[0].transactionType).toBe('DEBIT');

            // Source (Wallet) gets Credit
            expect(journal.transactions[1].accountId).toBe('wallet');
            expect(journal.transactions[1].transactionType).toBe('CREDIT');
        });
    });
});
