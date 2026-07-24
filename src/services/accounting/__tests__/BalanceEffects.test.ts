import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { checkJournal, effect, foldBalances, periodFlowSQL } from '../BalanceEffects';

describe('BalanceEffects', () => {
  describe('effect', () => {
    it('encodes normal-balance signs', () => {
      expect(effect(AccountType.ASSET, TransactionType.DEBIT).sign).toBe(1);
      expect(effect(AccountType.ASSET, TransactionType.CREDIT).sign).toBe(-1);
      expect(effect(AccountType.LIABILITY, TransactionType.CREDIT).sign).toBe(1);
      expect(effect(AccountType.INCOME, TransactionType.CREDIT).sign).toBe(1);
    });

    it('applies and deltas from the same sign', () => {
      const e = effect(AccountType.ASSET, TransactionType.DEBIT);
      expect(e.delta(10)).toBe(10);
      expect(e.apply(100, 10, 2)).toBe(110);
      expect(e.isIncrease).toBe(true);
      expect(e.flow).toBe('IN');
      expect(e.isLiquidInflow).toBe(true);
    });
  });

  describe('checkJournal', () => {
    it('accepts balanced lines', () => {
      const result = checkJournal([
        { amount: 100, type: TransactionType.DEBIT },
        { amount: 100, type: TransactionType.CREDIT },
      ]);
      expect(result.isValid).toBe(true);
      expect(result.imbalance).toBe(0);
    });

    it('rejects imbalance', () => {
      const result = checkJournal([
        { amount: 100, type: TransactionType.DEBIT },
        { amount: 90, type: TransactionType.CREDIT },
      ]);
      expect(result.isValid).toBe(false);
      expect(result.imbalance).toBe(10);
    });
  });

  describe('foldBalances', () => {
    it('returns running balances in order', () => {
      const { balances, final } = foldBalances(0, [
        {
          amount: 100,
          accountType: AccountType.ASSET,
          transactionType: TransactionType.DEBIT,
        },
        {
          amount: 40,
          accountType: AccountType.ASSET,
          transactionType: TransactionType.CREDIT,
        },
      ]);
      expect(balances).toEqual([100, 60]);
      expect(final).toBe(60);
    });
  });

  describe('periodFlowSQL', () => {
    it('emits increase and decrease cases from the same table', () => {
      const sql = periodFlowSQL();
      expect(sql.increaseCase).toContain(AccountType.ASSET);
      expect(sql.decreaseCase).toContain(AccountType.LIABILITY);
    });
  });
});
