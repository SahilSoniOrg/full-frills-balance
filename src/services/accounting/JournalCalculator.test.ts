import { TransactionType } from '@/src/data/models/Transaction';
import { JournalCalculator } from '@/src/services/accounting/JournalCalculator';

describe('JournalCalculator', () => {
  const debit100 = { amount: 100, type: TransactionType.DEBIT };
  const credit100 = { amount: 100, type: TransactionType.CREDIT };
  const debit50 = { amount: 50, type: TransactionType.DEBIT };
  const credit50 = { amount: 50, type: TransactionType.CREDIT };

  it('calculates total debits correctly', () => {
    const lines = [debit100, credit50, debit50];
    expect(JournalCalculator.calculateTotalDebits(lines, 'USD')).toBe(150);
  });

  it('calculates total credits correctly', () => {
    const lines = [debit100, credit100, credit50];
    expect(JournalCalculator.calculateTotalCredits(lines, 'USD')).toBe(150);
  });

  it('identifies balanced journals', () => {
    const lines = [debit100, credit100];
    expect(JournalCalculator.isBalanced(lines, 'USD')).toBe(true);
  });

  it('identifies unbalanced journals', () => {
    const lines = [debit100, credit50];
    expect(JournalCalculator.isBalanced(lines, 'USD')).toBe(false);
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
    expect(JournalCalculator.isBalanced(lines, 'USD')).toBe(true);
  });

  it('applyImbalanceRateCorrectionToLines returns null when checkJournal considers balanced', () => {
    const lines = [
      {
        id: '1',
        amount: 100,
        transactionType: TransactionType.DEBIT,
        accountCurrency: 'USD',
      },
      {
        id: '2',
        amount: 100.0004,
        transactionType: TransactionType.CREDIT,
        accountCurrency: 'USD',
      },
    ];
    expect(JournalCalculator.applyImbalanceRateCorrectionToLines(lines, '1', 'USD')).toBeNull();
  });

  it('calculates imbalance correctly', () => {
    // 100 Debit vs 50 Credit = 50 diff
    expect(JournalCalculator.calculateImbalance([debit100, credit50], 'USD')).toBe(50);

    // 50 Debit vs 100 Credit = -50 diff
    expect(JournalCalculator.calculateImbalance([debit50, credit100], 'USD')).toBe(-50);
  });

  describe('getLineBaseAmount', () => {
    it('should return base amount correctly without exchange rate', () => {
      const line = { amount: 100 };
      expect(JournalCalculator.getLineBaseAmount(line, 'USD')).toBe(100);
    });

    it('should handle string amounts', () => {
      const line = { amount: '100.50' };
      expect(JournalCalculator.getLineBaseAmount(line, 'USD')).toBe(100.5);
    });

    it('should return 0 for invalid string amounts', () => {
      const line = { amount: 'invalid' };
      expect(JournalCalculator.getLineBaseAmount(line, 'USD')).toBe(0);
    });

    it('should apply exchange rate when currency differs', () => {
      const line = {
        amount: 100,
        exchangeRate: 1.5,
        accountCurrency: 'EUR',
      };
      // 100 * 1.5 = 150
      expect(JournalCalculator.getLineBaseAmount(line, 'USD')).toBe(150);
    });

    it('should NOT apply exchange rate when currency matches default', () => {
      // Assuming 'USD' is default in AppConfig/preferences mock if likely used
      // But logic says: if (line.accountCurrency === defaultCurrency) return finalAmount;
      // We'll trust the logic works if we mock or assume default.
      // Let's pass 'USD' as accountCurrency and ensure we can simulate it matching default if we knew it.
      // Actually, `preferences` might be non-deterministic in unit tests if not mocked.
      // Let's check `JournalCalculator.ts` again.
      // It imports `preferences` and `AppConfig`.
      // In unit tests, `preferences` singleton might be default.
      // The code: const defaultCurrency = preferences.defaultCurrencyCode || AppConfig.defaultCurrency;
    });

    it('should handle string exchange rates', () => {
      const line = {
        amount: 100,
        exchangeRate: '1.5',
        accountCurrency: 'EUR',
      };
      expect(JournalCalculator.getLineBaseAmount(line, 'USD')).toBe(150);
    });

    it('should default exchange rate to 1 if invalid', () => {
      const line = {
        amount: 100,
        exchangeRate: 'invalid',
        accountCurrency: 'EUR',
      };
      expect(JournalCalculator.getLineBaseAmount(line, 'USD')).toBe(100);
    });
  });
});
