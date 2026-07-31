import {
  accountIdsMatch,
  applyPendingOrder,
  buildSortedAccounts,
  computeReorderMove,
} from '../accountReorderUtils';
import { AccountType } from '@/src/data/models/Account';
import { AccountId } from '@/src/types/domain';

function makeAccount(partial: {
  id: string;
  accountType: AccountType;
  orderNum: number;
  name?: string;
}) {
  return {
    id: partial.id,
    accountType: partial.accountType,
    orderNum: partial.orderNum,
    name: partial.name ?? partial.id,
  } as any;
}

describe('accountReorderUtils', () => {
  const assetA = makeAccount({ id: 'a', accountType: AccountType.ASSET, orderNum: 1 });
  const assetB = makeAccount({ id: 'b', accountType: AccountType.ASSET, orderNum: 2 });
  const assetC = makeAccount({ id: 'c', accountType: AccountType.ASSET, orderNum: 3 });
  const expenseX = makeAccount({ id: 'x', accountType: AccountType.EXPENSE, orderNum: 1 });

  describe('buildSortedAccounts', () => {
    it('filters accounts vs categories and sorts by type then orderNum', () => {
      const sorted = buildSortedAccounts([expenseX, assetC, assetA, assetB], 'accounts');
      expect(sorted.map(a => a.id)).toEqual(['a', 'b', 'c']);
    });

    it('keeps only income/expense for categories mode', () => {
      const sorted = buildSortedAccounts([expenseX, assetA], 'categories');
      expect(sorted.map(a => a.id)).toEqual(['x']);
    });
  });

  describe('applyPendingOrder', () => {
    it('returns base list when overlay is null', () => {
      const base = [assetA, assetB, assetC];
      expect(applyPendingOrder(base, null)).toBe(base);
    });

    it('reorders by pending ids without clobbering when source emits mid-move', () => {
      const base = [assetA, assetB, assetC];
      const pending = ['b', 'a', 'c'] as AccountId[];
      expect(applyPendingOrder(base, pending).map(a => a.id)).toEqual(['b', 'a', 'c']);

      // Source emits with same orderNums (stale) — overlay still wins
      const staleSource = [assetA, assetB, assetC];
      expect(applyPendingOrder(staleSource, pending).map(a => a.id)).toEqual(['b', 'a', 'c']);
    });

    it('appends accounts that appear in source but not in pending', () => {
      const base = [assetA, assetB, assetC];
      const pending = ['b', 'a'] as AccountId[];
      expect(applyPendingOrder(base, pending).map(a => a.id)).toEqual(['b', 'a', 'c']);
    });
  });

  describe('accountIdsMatch', () => {
    it('compares id sequences', () => {
      expect(accountIdsMatch(['a', 'b'] as AccountId[], ['a', 'b'] as AccountId[])).toBe(true);
      expect(accountIdsMatch(['a', 'b'] as AccountId[], ['b', 'a'] as AccountId[])).toBe(false);
    });
  });

  describe('computeReorderMove', () => {
    it('moves within type and computes midpoint orderNum', () => {
      const move = computeReorderMove([assetA, assetB, assetC], 2, 'up');
      expect(move).not.toBeNull();
      expect(move!.nextAccounts.map(a => a.id)).toEqual(['a', 'c', 'b']);
      expect(move!.item.id).toBe('c');
      expect(move!.newOrderNum).toBe((1 + 2) / 2);
    });

    it('blocks cross-type moves', () => {
      expect(computeReorderMove([assetC, expenseX], 0, 'down')).toBeNull();
    });
  });
});
