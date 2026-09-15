import { AccountId } from '@/src/types/ids';

import { computeSplitTotals, validateSplitState } from '@/src/services/journal/splitJournalHelpers';

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

    it('requires at least two splits', () => {
      const result = validateSplitState({
        sourceAccountId: 'bank' as AccountId,
        totalAmount: '50',
        splits: [{ id: 'a', accountId: 'food' as AccountId, amount: '50' }],
      });
      expect(result).toEqual({ valid: false, error: 'too_few_splits' });
    });
  });
});
