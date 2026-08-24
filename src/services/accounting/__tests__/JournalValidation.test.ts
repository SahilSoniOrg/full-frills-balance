import { AccountType, TransactionType } from '@/src/types/enums';

import { checkJournal, effect } from '@/src/utils/accounting/BalanceEffects';
import {
  constructSimpleJournal,
  isBackdated,
  validateDistinctAccounts,
} from '@/src/services/accounting/JournalValidation';

describe('JournalValidation', () => {
  describe('validateDistinctAccounts', () => {
    it('returns valid if 2+ accounts', () => {
      expect(validateDistinctAccounts(['A', 'B']).isValid).toBe(true);
    });

    it('returns invalid if same account', () => {
      expect(validateDistinctAccounts(['A', 'A']).isValid).toBe(false);
    });

    it('ignores null/undefined/empty', () => {
      expect(validateDistinctAccounts(['A', '', undefined] as any).isValid).toBe(false);
    });
  });

  describe('isBackdated', () => {
    it('returns false if no latest transaction', () => {
      expect(isBackdated(Date.now())).toBe(false);
    });

    it('returns true if current date is before latest', () => {
      const latest = Date.now();
      const current = latest - 1000;
      expect(isBackdated(current, latest)).toBe(true);
    });

    it('returns false if current date is after latest', () => {
      const latest = Date.now();
      const current = latest + 1000;
      expect(isBackdated(current, latest)).toBe(false);
    });
  });

  describe('constructSimpleJournal', () => {
    it('constructs a 2-line journal entry', () => {
      const journal = constructSimpleJournal({
        type: 'expense',
        amount: 100,
        sourceAccount: { id: 'wallet', type: AccountType.ASSET, rate: 1 },
        destinationAccount: { id: 'food', type: AccountType.EXPENSE, rate: 1 },
        description: 'Lunch',
        date: 123456789,
      });

      expect(journal.journalDate).toBe(123456789);
      expect(journal.description).toBe('Lunch');
      expect(journal.transactions).toHaveLength(2);
      expect(journal.transactions[0].accountId).toBe('food');
      expect(journal.transactions[0].transactionType).toBe(TransactionType.DEBIT);
      expect(journal.transactions[1].accountId).toBe('wallet');
      expect(journal.transactions[1].transactionType).toBe(TransactionType.CREDIT);
    });
  });
});

describe('BalanceEffects (migrated from AccountingService)', () => {
  it('returns correct sign for Asset Debit / Liability Credit', () => {
    expect(effect(AccountType.ASSET, TransactionType.DEBIT).sign).toBe(1);
    expect(effect(AccountType.LIABILITY, TransactionType.CREDIT).sign).toBe(1);
  });

  it('applies balance with precision', () => {
    expect(effect(AccountType.ASSET, TransactionType.DEBIT).apply(100, 50)).toBe(150);
    expect(effect(AccountType.ASSET, TransactionType.CREDIT).apply(100, 50)).toBe(50);
    expect(effect(AccountType.ASSET, TransactionType.DEBIT).apply(100.12, 0.005, 2)).toBe(100.13);
  });

  it('checkJournal validates balance', () => {
    expect(
      checkJournal([
        { amount: 100, type: TransactionType.DEBIT },
        { amount: 100, type: TransactionType.CREDIT },
      ]).isValid,
    ).toBe(true);
    expect(
      checkJournal([
        { amount: 100, type: TransactionType.DEBIT },
        { amount: 90, type: TransactionType.CREDIT },
      ]).isValid,
    ).toBe(false);
  });
});
