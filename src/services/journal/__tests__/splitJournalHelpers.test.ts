import Account from '@/src/data/models/Account';
import { AccountId, AccountType, TransactionType } from '@/src/types/domain';

import {
  buildJournalLinesFromSplitState,
  computeSplitTotals,
  createEmptySplitRow,
  SPLIT_SOURCE_LINE_ID,
  validateSplitState,
} from '@/src/services/journal/splitJournalHelpers';

const accounts = [
  {
    id: 'bank' as AccountId,
    name: 'Bank',
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
  },
  {
    id: 'food' as AccountId,
    name: 'Food',
    accountType: AccountType.EXPENSE,
    currencyCode: 'USD',
  },
] as unknown as Account[];

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

  describe('buildJournalLinesFromSplitState', () => {
    it('builds balanced lines for $50 with $40 + $10 category splits', () => {
      const lines = buildJournalLinesFromSplitState({
        sourceAccountId: 'bank' as AccountId,
        sourceAmount: '50',
        splits: [
          { id: 'split-1', accountId: 'food' as AccountId, amount: '40' },
          { id: 'split-2', accountId: 'food' as AccountId, amount: '10' },
        ],
        accounts,
      });

      expect(lines).toHaveLength(3);

      const credit = lines.find(l => l.transactionType === TransactionType.CREDIT);
      expect(credit?.id).toBe(SPLIT_SOURCE_LINE_ID);
      expect(credit?.accountId).toBe('bank');
      expect(credit?.amount).toBe('50');

      const debits = lines.filter(l => l.transactionType === TransactionType.DEBIT);
      expect(debits.map(l => l.amount)).toEqual(['40', '10']);

      const creditTotal = lines
        .filter(l => l.transactionType === TransactionType.CREDIT)
        .reduce((s, l) => s + parseFloat(l.amount), 0);
      const debitTotal = lines
        .filter(l => l.transactionType === TransactionType.DEBIT)
        .reduce((s, l) => s + parseFloat(l.amount), 0);
      expect(creditTotal).toBe(debitTotal);
    });
  });

  describe('validateSplitState', () => {
    it('accepts valid split state', () => {
      const result = validateSplitState({
        sourceAccountId: 'bank' as AccountId,
        totalAmount: '50',
        splits: [createEmptySplitRow('split-1'), createEmptySplitRow('split-2')].map((row, i) => ({
          ...row,
          accountId: 'food' as AccountId,
          amount: i === 0 ? '40' : '10',
        })),
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
