import { AccountType, TransactionType } from '@/src/types/enums';

import { checkJournal, effect } from '@/src/utils/accounting/BalanceEffects';
import { validateDistinctAccounts } from '@/src/services/accounting/JournalValidation';

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
