import { AccountSubtype, AccountType, TransactionType } from '@/src/types/enums';
import { AccountId } from '@/src/types/ids';

import {
  assertNotSelfParent,
  assertParentMatchesChildType,
  dedupeMergeSourceAccountIds,
  isBalanceAdjustmentNeeded,
  journalLegTypesForSignedAmount,
  resolveAccountSubtype,
  shouldPostInitialBalance,
} from '@/src/services/accounts/accountRules';

describe('accountRules', () => {
  describe('resolveAccountSubtype', () => {
    it('defaults subtype from account type', () => {
      expect(resolveAccountSubtype(AccountType.ASSET)).toBe(AccountSubtype.CASH);
      expect(resolveAccountSubtype(AccountType.ASSET, AccountSubtype.INVESTMENT)).toBe(
        AccountSubtype.INVESTMENT,
      );
    });
  });

  describe('hierarchy', () => {
    it('rejects parent type mismatch', () => {
      expect(() =>
        assertParentMatchesChildType(AccountType.ASSET, {
          accountType: AccountType.LIABILITY,
          name: 'Card',
        }),
      ).toThrow('Parent account must be of the same type');
    });

    it('rejects self-parent', () => {
      expect(() => assertNotSelfParent('a' as AccountId, 'a' as AccountId)).toThrow(
        'cannot be its own parent',
      );
    });
  });

  describe('initial balance', () => {
    it('skips negligible initial balances', () => {
      expect(shouldPostInitialBalance(0, 2)).toBe(false);
      expect(shouldPostInitialBalance(0.001, 2)).toBe(false);
      expect(shouldPostInitialBalance(10, 2)).toBe(true);
    });

    it('maps asset increase to debit on the account leg', () => {
      const { accountTxType, balancingTxType } = journalLegTypesForSignedAmount(
        AccountType.ASSET,
        100,
      );
      expect(accountTxType).toBe(TransactionType.DEBIT);
      expect(balancingTxType).toBe(TransactionType.CREDIT);
    });
  });

  describe('balance adjustment', () => {
    it('treats tiny discrepancies as no-op', () => {
      expect(isBalanceAdjustmentNeeded(0.0005, 2)).toBe(false);
      expect(isBalanceAdjustmentNeeded(5, 2)).toBe(true);
    });
  });

  describe('merge sources', () => {
    it('dedupes and removes target id', () => {
      const target = 't' as AccountId;
      expect(dedupeMergeSourceAccountIds(target, ['t', 'a', 'a', 'b'] as AccountId[])).toEqual([
        'a',
        'b',
      ]);
    });
  });
});
