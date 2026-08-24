import {
  asTransactionSnapshots,
  collectTransactionAccountIds,
  formatAuditAccountLabel,
  shouldHideUnchangedTransactionLeg,
} from '@/src/features/audit/auditLogDiffDisplay';
import { AccountId } from '@/src/types/ids';

describe('auditLogDiffDisplay', () => {
  const accountMap = {
    'acc-1': { name: 'Cash', currency: 'USD' },
  };

  describe('formatAuditAccountLabel', () => {
    it('uses account map name when snapshot has no accountName', () => {
      expect(formatAuditAccountLabel('acc-1' as AccountId, undefined, accountMap)).toBe('Cash');
    });

    it('prefers snapshot accountName', () => {
      expect(
        formatAuditAccountLabel(
          'acc-1' as AccountId,
          { accountId: 'acc-1' as AccountId, amount: 1, type: 'DEBIT', accountName: 'Wallet' },
          accountMap,
        ),
      ).toBe('Wallet');
    });
  });

  describe('asTransactionSnapshots', () => {
    it('filters non-transaction array entries', () => {
      const result = asTransactionSnapshots([
        { accountId: 'acc-1', amount: 10, type: 'DEBIT' },
        { foo: 'bar' },
        null,
      ]);
      expect(result).toHaveLength(1);
      expect(result[0].amount).toBe(10);
    });
  });

  describe('collectTransactionAccountIds', () => {
    it('returns union of account ids', () => {
      const ids = collectTransactionAccountIds(
        [{ accountId: 'a' as AccountId, amount: 1, type: 'DEBIT' }],
        [{ accountId: 'b' as AccountId, amount: 2, type: 'CREDIT' }],
      );
      expect(ids.sort()).toEqual(['a', 'b']);
    });
  });

  describe('shouldHideUnchangedTransactionLeg', () => {
    const leg = (amount: number, type: string) => ({
      accountId: 'acc-1' as AccountId,
      amount,
      type,
    });

    it('hides when amount and type are unchanged', () => {
      expect(shouldHideUnchangedTransactionLeg(leg(10, 'DEBIT'), leg(10, 'DEBIT'))).toBe(true);
    });

    it('shows when type changes', () => {
      expect(shouldHideUnchangedTransactionLeg(leg(10, 'DEBIT'), leg(10, 'CREDIT'))).toBe(false);
    });
  });
});
