import { TransactionType } from '@/src/types/enums';

import {
  getJournalLineBaseAmount,
  isJournalBalanced,
} from '@/src/services/accounting/JournalCalculator';

describe('JournalCalculator', () => {
  const debit100 = { amount: 100, type: TransactionType.DEBIT };
  const credit100 = { amount: 100, type: TransactionType.CREDIT };
  const credit50 = { amount: 50, type: TransactionType.CREDIT };

  it('identifies balanced journals', () => {
    const lines = [debit100, credit100];
    expect(isJournalBalanced(lines, 'USD')).toBe(true);
  });

  it('identifies unbalanced journals', () => {
    const lines = [debit100, credit50];
    expect(isJournalBalanced(lines, 'USD')).toBe(false);
  });

  it('isBalanced agrees with BalanceEffects.checkJournal for FX lines', () => {
    const lines = [
      { amount: 150, type: TransactionType.DEBIT, accountCurrency: 'USD' },
      {
        amount: 100,
        type: TransactionType.CREDIT,
        exchangeRate: 1.5,
        accountCurrency: 'EUR',
      },
    ];
    expect(isJournalBalanced(lines, 'USD')).toBe(true);
  });

  it('rejects minor-unit FX drift that checkJournal tolerance used to accept', () => {
    // THB 76.82 × 2.89 = 222.0098; evaluator is exact in minor units.
    const lines = [
      {
        amount: 76.82,
        type: TransactionType.DEBIT,
        exchangeRate: 2.89,
        accountCurrency: 'THB',
      },
      {
        amount: 222,
        type: TransactionType.CREDIT,
        accountCurrency: 'INR',
      },
    ];

    expect(isJournalBalanced(lines, 'INR')).toBe(false);
  });

  it('rejects FX drift even when rate-scaled checkJournal tolerance would pass', () => {
    // HKD 4.11 × 12.17 = 50.0187; evaluator requires exact minor-unit balance.
    const lines = [
      {
        amount: 4.11,
        type: TransactionType.DEBIT,
        exchangeRate: 12.17,
        accountCurrency: 'HKD',
      },
      {
        amount: 50,
        type: TransactionType.CREDIT,
        accountCurrency: 'INR',
      },
    ];

    expect(isJournalBalanced(lines, 'INR')).toBe(false);
  });

  describe('getLineBaseAmount', () => {
    it('should return base amount correctly without exchange rate', () => {
      const line = { amount: 100 };
      expect(getJournalLineBaseAmount(line, 'USD')).toBe(100);
    });

    it('should handle string amounts', () => {
      const line = { amount: '100.50' };
      expect(getJournalLineBaseAmount(line, 'USD')).toBe(100.5);
    });

    it('should return 0 for invalid string amounts', () => {
      const line = { amount: 'invalid' };
      expect(getJournalLineBaseAmount(line, 'USD')).toBe(0);
    });

    it('should apply exchange rate when currency differs', () => {
      const line = {
        amount: 100,
        exchangeRate: 1.5,
        accountCurrency: 'EUR',
      };
      // 100 * 1.5 = 150
      expect(getJournalLineBaseAmount(line, 'USD')).toBe(150);
    });

    it('should NOT apply exchange rate when currency matches default', () => {
      expect(
        getJournalLineBaseAmount(
          { amount: '100.50', exchangeRate: 9, accountCurrency: 'USD' },
          'USD',
        ),
      ).toBe(100.5);
    });

    it('should handle string exchange rates', () => {
      const line = {
        amount: 100,
        exchangeRate: '1.5',
        accountCurrency: 'EUR',
      };
      expect(getJournalLineBaseAmount(line, 'USD')).toBe(150);
    });

    it('should default exchange rate to 1 if invalid', () => {
      const line = {
        amount: 100,
        exchangeRate: 'invalid',
        accountCurrency: 'EUR',
      };
      expect(getJournalLineBaseAmount(line, 'USD')).toBe(100);
    });
  });
});
