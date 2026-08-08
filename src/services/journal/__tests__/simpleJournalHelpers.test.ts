import {
  computeSimpleConvertedAmount,
  deriveCrossCurrencyDisplayRate,
  ensureSelectedAccountVisible,
  resolveSimpleCrossCurrencyRates,
} from '@/src/services/journal/simpleJournalHelpers';
import { AccountType, EMPTY_ACCOUNT_ID } from '@/src/types/domain';

describe('simpleJournalHelpers cross-currency', () => {
  describe('deriveCrossCurrencyDisplayRate', () => {
    it('computes source per dest from base-relative rates', () => {
      expect(deriveCrossCurrencyDisplayRate(83, 1)).toBe(83);
      expect(deriveCrossCurrencyDisplayRate(1, 83)).toBeCloseTo(1 / 83);
    });
  });

  describe('resolveSimpleCrossCurrencyRates', () => {
    it('uses 1.0 for legs already in workplace currency', () => {
      const resolved = resolveSimpleCrossCurrencyRates({
        sourceCurrency: 'USD',
        destCurrency: 'INR',
        workplaceCurrency: 'USD',
        fetchedSourceToWorkplace: 99,
        fetchedDestToWorkplace: 83,
      });
      expect(resolved.sourceBaseRate).toBe(1);
      expect(resolved.destBaseRate).toBe(83);
      expect(resolved.exchangeRate).toBeCloseTo(1 / 83);
    });

    it('uses fetched rates for both legs when neither is workplace currency', () => {
      const resolved = resolveSimpleCrossCurrencyRates({
        sourceCurrency: 'EUR',
        destCurrency: 'INR',
        workplaceCurrency: 'USD',
        fetchedSourceToWorkplace: 1.1,
        fetchedDestToWorkplace: 83,
      });
      expect(resolved.sourceBaseRate).toBe(1.1);
      expect(resolved.destBaseRate).toBe(83);
      expect(resolved.exchangeRate).toBeCloseTo(1.1 / 83);
    });
  });

  describe('computeSimpleConvertedAmount', () => {
    it('returns amount unchanged when not cross-currency', () => {
      expect(computeSimpleConvertedAmount(50, false, 2)).toBe(50);
    });

    it('multiplies by exchange rate when cross-currency', () => {
      expect(computeSimpleConvertedAmount(100, true, 0.5)).toBe(50);
      expect(computeSimpleConvertedAmount(100, true, null)).toBe(100);
    });
  });
});

describe('ensureSelectedAccountVisible', () => {
  const pool = [
    { id: 'cash', name: 'Cash', accountType: AccountType.ASSET },
    { id: 'bank', name: 'Bank', accountType: AccountType.ASSET },
    { id: 'equity', name: 'Equity', accountType: AccountType.EQUITY },
  ] as any[];

  it('prepends the selected account when it is missing from the section list', () => {
    expect(
      ensureSelectedAccountVisible(
        [{ id: 'bank', name: 'Bank', accountType: AccountType.ASSET } as any],
        'equity' as any,
        pool,
      ).map(account => account.id),
    ).toEqual(['equity', 'bank']);
  });

  it('returns the section unchanged when nothing is selected', () => {
    const section = [{ id: 'bank', name: 'Bank', accountType: AccountType.ASSET } as any];
    expect(ensureSelectedAccountVisible(section, EMPTY_ACCOUNT_ID, pool)).toBe(section);
  });
});
