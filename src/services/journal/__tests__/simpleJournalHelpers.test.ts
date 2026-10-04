import {
  buildSimpleCrossCurrencyLineUpdates,
  ensureSelectedAccountVisible,
  hasNegativeAmountSign,
  parseSimpleAmountInput,
  resolveSimpleHeroAmount,
} from '@/src/services/journal/simpleJournalHelpers';
import { AccountType } from '@/src/types/enums';
import { EMPTY_ACCOUNT_ID } from '@/src/types/ids';

describe('simpleJournalHelpers cross-currency', () => {
  describe('parseSimpleAmountInput', () => {
    it('rejects pasted negative signs without converting them to positive amounts', () => {
      expect(hasNegativeAmountSign('-50')).toBe(true);
      expect(parseSimpleAmountInput('-50')).toBe(0);
      expect(parseSimpleAmountInput('50')).toBe(50);
      expect(parseSimpleAmountInput('')).toBe(0);
    });
  });

  describe('resolveSimpleHeroAmount', () => {
    it('keeps an empty source amount instead of filling from the destination', () => {
      expect(resolveSimpleHeroAmount('', '0.00')).toBe('');
      expect(resolveSimpleHeroAmount('50', '4797.73')).toBe('50');
      expect(resolveSimpleHeroAmount(undefined, '50')).toBe('50');
    });
  });

  it('keeps workplace-relative rates for two lines in the same foreign currency', () => {
    const updates = buildSimpleCrossCurrencyLineUpdates({
      isCrossCurrency: false,
      exchangeRate: 1,
      sourceBaseRate: 95.51,
      destBaseRate: 95.51,
      sourceCurrency: 'USD',
      destCurrency: 'USD',
      destPrecision: 2,
      baseCurrency: 'INR',
      amount: '5.99',
      convertedAmount: 5.99,
      sourceLine: { id: 'source' as any, exchangeRate: '', amount: '5.99' },
      destinationLine: { id: 'destination' as any, exchangeRate: '', amount: '5.99' },
    });

    expect(updates).toEqual({
      source: { exchangeRate: '95.510000' },
      destination: { exchangeRate: '95.510000' },
    });
  });

  it('restores the source amount when the destination returns to the same currency', () => {
    const updates = buildSimpleCrossCurrencyLineUpdates({
      isCrossCurrency: false,
      exchangeRate: 1,
      sourceBaseRate: 95.85,
      destBaseRate: 95.85,
      sourceCurrency: 'USD',
      destCurrency: 'USD',
      destPrecision: 2,
      baseCurrency: 'INR',
      amount: '6',
      convertedAmount: 6,
      sourceLine: { id: 'source' as any, exchangeRate: '95.850000', amount: '6' },
      destinationLine: { id: 'destination' as any, exchangeRate: '', amount: '575.08' },
    });

    expect(updates.destination).toEqual({ exchangeRate: '95.850000', amount: '6' });
  });

  const crossCurrencyInput = {
    isCrossCurrency: true,
    exchangeRate: 151.237,
    sourceBaseRate: 1,
    destBaseRate: 0.0066,
    sourceCurrency: 'USD',
    baseCurrency: 'USD',
    amount: '10.00',
    convertedAmount: 1512.37,
    sourceLine: { id: 'source' as any, exchangeRate: '', amount: '10.00' },
    destinationLine: { id: 'destination' as any, exchangeRate: '', amount: '' },
  };

  it('formats the converted amount with the supplied destination precision', () => {
    expect(
      buildSimpleCrossCurrencyLineUpdates({
        ...crossCurrencyInput,
        destCurrency: 'JPY',
        destPrecision: 0,
      }).destination?.amount,
    ).toBe('1512');
    expect(
      buildSimpleCrossCurrencyLineUpdates({
        ...crossCurrencyInput,
        destCurrency: 'JPY',
        destPrecision: 3,
      }).destination?.amount,
    ).toBe('1512.370');
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
