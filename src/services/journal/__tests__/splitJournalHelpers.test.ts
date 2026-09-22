import { AccountId } from '@/src/types/ids';

import {
  computeSplitTotals,
  distributeSplitRemainder,
  equalizeSplitAmounts,
  validateSplitState,
} from '@/src/services/journal/splitJournalHelpers';

describe('splitJournalHelpers', () => {
  describe('computeSplitTotals', () => {
    it('computes remaining amount for partial allocation', () => {
      const totals = computeSplitTotals('50', [
        { id: 'a', accountId: 'food' as AccountId, amount: '40' },
        { id: 'b', accountId: 'food' as AccountId, amount: '' },
      ]);
      expect(totals.total).toBe(50);
      expect(totals.allocated).toBe(40);
      expect(totals.remaining).toBe(10);
    });

    it('rounds accumulated decimal amounts before displaying the remainder', () => {
      const totals = computeSplitTotals('0.30', [
        { id: 'a', accountId: 'food' as AccountId, amount: '0.10' },
        { id: 'b', accountId: 'food' as AccountId, amount: '0.20' },
      ]);

      expect(totals.allocated).toBe(0.3);
      expect(totals.remaining).toBe(0);
    });

    it('reports allocation totals in the source currency after conversion', () => {
      const totals = computeSplitTotals(
        '100',
        [
          {
            id: 'usd-row',
            accountId: 'food' as AccountId,
            amount: '1.20',
            accountCurrency: 'USD',
          },
        ],
        2,
        { baseCurrency: 'USD', sourceCurrency: 'INR', sourceExchangeRate: 0.012 },
      );

      expect(totals).toEqual({ total: 100, allocated: 100, remaining: 0 });
    });
  });

  describe('validateSplitState', () => {
    it('accepts valid split state', () => {
      const result = validateSplitState({
        sourceAccountId: 'bank' as AccountId,
        totalAmount: '50',
        splits: [
          { id: 'split-1', accountId: 'food' as AccountId, amount: '40' },
          { id: 'split-2', accountId: 'food' as AccountId, amount: '10' },
        ],
      });
      expect(result).toEqual({ valid: true });
    });

    it('rejects when split amounts do not sum to total', () => {
      const result = validateSplitState({
        sourceAccountId: 'bank' as AccountId,
        totalAmount: '50',
        splits: [
          { id: 'a', accountId: 'food' as AccountId, amount: '30' },
          { id: 'b', accountId: 'food' as AccountId, amount: '10' },
        ],
      });
      expect(result).toEqual({ valid: false, error: 'sum_mismatch' });
    });

    it('accepts a single split', () => {
      const result = validateSplitState({
        sourceAccountId: 'bank' as AccountId,
        totalAmount: '50',
        splits: [{ id: 'a', accountId: 'food' as AccountId, amount: '50' }],
      });
      expect(result).toEqual({ valid: true });
    });

    it('keeps an empty allocation unbalanced', () => {
      const result = validateSplitState({
        sourceAccountId: 'bank' as AccountId,
        totalAmount: '50',
        splits: [],
      });
      expect(result).toEqual({ valid: false, error: 'sum_mismatch' });
    });

    it('accepts allocations that only differ because of floating-point addition', () => {
      const result = validateSplitState({
        sourceAccountId: 'bank' as AccountId,
        totalAmount: '0.30',
        splits: [
          { id: 'a', accountId: 'food' as AccountId, amount: '0.10' },
          { id: 'b', accountId: 'food' as AccountId, amount: '0.20' },
        ],
      });

      expect(result).toEqual({ valid: true });
    });

    it('uses the supplied source precision for non-currency validation', () => {
      const result = validateSplitState({
        sourceAccountId: 'bhd-wallet' as AccountId,
        totalAmount: '1.005',
        precision: 3,
        splits: [
          { id: 'a', accountId: 'one' as AccountId, amount: '0.502' },
          { id: 'b', accountId: 'two' as AccountId, amount: '0.503' },
        ],
      });

      expect(result).toEqual({ valid: true });
    });

    it('rejects equal nominal amounts when currencies convert to different values', () => {
      const result = validateSplitState({
        sourceAccountId: 'inr-wallet' as AccountId,
        totalAmount: '100',
        currency: {
          baseCurrency: 'USD',
          sourceCurrency: 'INR',
          sourceExchangeRate: 0.012,
        },
        splits: [
          {
            id: 'usd-category',
            accountId: 'groceries' as AccountId,
            amount: '100',
            accountCurrency: 'USD',
          },
        ],
      });

      expect(result).toEqual({ valid: false, error: 'sum_mismatch' });
    });
  });

  describe('split allocation shortcuts', () => {
    const rows = (amounts: string[]) =>
      amounts.map((amount, index) => ({
        id: `row-${index}`,
        accountId: `account-${index}` as AccountId,
        amount,
      }));

    it('fills empty rows evenly and preserves the total cents', () => {
      expect(distributeSplitRemainder('50.00', rows(['20.00', '', '']))).toEqual(
        rows(['20.00', '15.00', '15.00']),
      );
    });

    it('distributes a remainder proportionally when every row has a value', () => {
      expect(distributeSplitRemainder('40.00', rows(['20.00', '10.00']))).toEqual(
        rows(['26.67', '13.33']),
      );
    });

    it('equalizes with deterministic leftover-cent handling', () => {
      expect(equalizeSplitAmounts('10.00', rows(['', '', '']))).toEqual(
        rows(['3.34', '3.33', '3.33']),
      );
    });

    it('uses the currency precision for zero-decimal currencies', () => {
      expect(equalizeSplitAmounts('1000', rows(['', '', '']), 0)).toEqual(
        rows(['334', '333', '333']),
      );
    });

    it('uses the currency precision for three-decimal currencies', () => {
      expect(equalizeSplitAmounts('1', rows(['', '', '']), 3)).toEqual(
        rows(['0.334', '0.333', '0.333']),
      );
    });

    it('keeps equalized cross-currency rows valid after conversion', () => {
      const currency = {
        baseCurrency: 'USD',
        sourceCurrency: 'INR',
        sourceExchangeRate: 0.012,
      };
      const splits = [
        {
          id: 'usd-row',
          accountId: 'usd' as AccountId,
          amount: '',
          accountCurrency: 'USD',
        },
        {
          id: 'eur-row',
          accountId: 'eur' as AccountId,
          amount: '',
          accountCurrency: 'EUR',
          exchangeRate: 1.1,
        },
      ];
      const result = equalizeSplitAmounts('100', splits, 2, currency);

      expect(
        validateSplitState({
          sourceAccountId: 'source' as AccountId,
          totalAmount: '100',
          splits: result,
          currency,
        }),
      ).toEqual({ valid: true });
    });

    it('uses each allocation currency precision when the source has zero decimals', () => {
      const currency = {
        baseCurrency: 'USD',
        sourceCurrency: 'JPY',
        sourceExchangeRate: 0.0067,
      };
      const splits = [
        {
          id: 'usd-row',
          accountId: 'usd' as AccountId,
          amount: '',
          accountCurrency: 'USD',
          precision: 2,
        },
        {
          id: 'eur-row',
          accountId: 'eur' as AccountId,
          amount: '',
          accountCurrency: 'USD',
          precision: 2,
        },
      ];
      const result = equalizeSplitAmounts('1000', splits, 0, currency);

      expect(result.map(split => split.amount)).toEqual(['3.35', '3.35']);
      expect(
        validateSplitState({
          sourceAccountId: 'source' as AccountId,
          totalAmount: '1000',
          precision: 0,
          splits: result,
          currency,
        }),
      ).toEqual({ valid: true });
    });

    it('reconciles cross-currency rows after distributing an empty remainder', () => {
      const currency = {
        baseCurrency: 'USD',
        sourceCurrency: 'INR',
        sourceExchangeRate: 0.012,
      };
      const result = distributeSplitRemainder(
        '100',
        [
          {
            id: 'usd-row',
            accountId: 'usd' as AccountId,
            amount: '',
            accountCurrency: 'USD',
          },
          {
            id: 'eur-row',
            accountId: 'eur' as AccountId,
            amount: '',
            accountCurrency: 'EUR',
            exchangeRate: 1.1,
          },
        ],
        2,
        currency,
      );

      expect(
        validateSplitState({
          sourceAccountId: 'source' as AccountId,
          totalAmount: '100',
          splits: result,
          currency,
        }),
      ).toEqual({ valid: true });
    });

    it('reconciles cross-currency rows after proportional distribution', () => {
      const currency = {
        baseCurrency: 'USD',
        sourceCurrency: 'INR',
        sourceExchangeRate: 0.012,
      };
      const result = distributeSplitRemainder(
        '100',
        [
          {
            id: 'usd-row',
            accountId: 'usd' as AccountId,
            amount: '0.01',
            accountCurrency: 'USD',
          },
          {
            id: 'eur-row',
            accountId: 'eur' as AccountId,
            amount: '0.01',
            accountCurrency: 'EUR',
            exchangeRate: 1.1,
          },
        ],
        2,
        currency,
      );

      expect(
        validateSplitState({
          sourceAccountId: 'source' as AccountId,
          totalAmount: '100',
          splits: result,
          currency,
        }),
      ).toEqual({ valid: true });
    });
  });
});
