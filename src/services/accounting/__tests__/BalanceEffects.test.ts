import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { checkJournal, effect, foldBalances, periodFlowSQL } from '../BalanceEffects';

describe('BalanceEffects', () => {
  describe('effect', () => {
    it('encodes normal-balance signs', () => {
      expect(effect(AccountType.ASSET, TransactionType.DEBIT).sign).toBe(1);
      expect(effect(AccountType.ASSET, TransactionType.CREDIT).sign).toBe(-1);
      expect(effect(AccountType.EXPENSE, TransactionType.DEBIT).sign).toBe(1);
      expect(effect(AccountType.EXPENSE, TransactionType.CREDIT).sign).toBe(-1);
      expect(effect(AccountType.LIABILITY, TransactionType.CREDIT).sign).toBe(1);
      expect(effect(AccountType.LIABILITY, TransactionType.DEBIT).sign).toBe(-1);
      expect(effect(AccountType.EQUITY, TransactionType.CREDIT).sign).toBe(1);
      expect(effect(AccountType.INCOME, TransactionType.CREDIT).sign).toBe(1);
      expect(effect(AccountType.INCOME, TransactionType.DEBIT).sign).toBe(-1);
      expect(effect('UNKNOWN' as any, TransactionType.DEBIT).sign).toBe(0);
    });

    it('applies and deltas from the same sign', () => {
      const e = effect(AccountType.ASSET, TransactionType.DEBIT);
      expect(e.delta(10)).toBe(10);
      expect(e.apply(100, 10, 2)).toBe(110);
      expect(e.isIncrease).toBe(true);
      expect(e.flow).toBe('IN');
      expect(e.isLiquidInflow).toBe(true);
    });

    it('marks credit as OUT flow and decrease for assets', () => {
      const e = effect(AccountType.ASSET, TransactionType.CREDIT);
      expect(e.isIncrease).toBe(false);
      expect(e.flow).toBe('OUT');
      expect(e.isLiquidOutflow).toBe(true);
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
      expect(result.totalDebits).toBe(100);
      expect(result.totalCredits).toBe(100);
    });

    it('rejects imbalance', () => {
      const result = checkJournal([
        { amount: 100, type: TransactionType.DEBIT },
        { amount: 90, type: TransactionType.CREDIT },
      ]);
      expect(result.isValid).toBe(false);
      expect(result.imbalance).toBe(10);
    });

    it('handles exchange rates', () => {
      const result = checkJournal([
        { amount: 100, type: TransactionType.DEBIT, exchangeRate: 1.2 },
        { amount: 120, type: TransactionType.CREDIT },
      ]);
      expect(result.isValid).toBe(true);
      expect(result.totalDebits).toBe(120);
    });

    it('handles precision-aware imbalance', () => {
      const result = checkJournal(
        [
          { amount: 100.001, type: TransactionType.DEBIT },
          { amount: 100, type: TransactionType.CREDIT },
        ],
        2,
      );
      expect(result.isValid).toBe(true);
      expect(result.imbalance).toBe(0);
    });

    it('respects precision argument for imbalance detection', () => {
      const lines = [
        { amount: 100.01, type: TransactionType.DEBIT },
        { amount: 100, type: TransactionType.CREDIT },
      ];
      expect(checkJournal(lines, 2).isValid).toBe(false);
      expect(checkJournal(lines, 1).isValid).toBe(true);
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
