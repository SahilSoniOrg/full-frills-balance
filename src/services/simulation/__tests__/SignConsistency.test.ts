import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { getAccountBalanceDelta, getLiquidNetWorthDelta } from '@/src/utils/accountingHelpers';

describe('Sign Consistency Invariants', () => {
  describe('Accounting Helpers', () => {
    test('Asset: Debit (+), Credit (-)', () => {
      expect(getAccountBalanceDelta(100, AccountType.ASSET, TransactionType.DEBIT)).toBe(100);
      expect(getAccountBalanceDelta(100, AccountType.ASSET, TransactionType.CREDIT)).toBe(-100);
    });

    test('Liability: Credit (+), Debit (-)', () => {
      expect(getAccountBalanceDelta(100, AccountType.LIABILITY, TransactionType.CREDIT)).toBe(100);
      expect(getAccountBalanceDelta(100, AccountType.LIABILITY, TransactionType.DEBIT)).toBe(-100);
    });

    test('Expense: Debit (+), Credit (-)', () => {
      expect(getAccountBalanceDelta(100, AccountType.EXPENSE, TransactionType.DEBIT)).toBe(100);
      expect(getAccountBalanceDelta(100, AccountType.EXPENSE, TransactionType.CREDIT)).toBe(-100);
    });

    test('Income: Credit (+), Debit (-)', () => {
      expect(getAccountBalanceDelta(100, AccountType.INCOME, TransactionType.CREDIT)).toBe(100);
      expect(getAccountBalanceDelta(100, AccountType.INCOME, TransactionType.DEBIT)).toBe(-100);
    });

    test('Net Worth Impact - Assets: Debit (+), Credit (-)', () => {
      expect(getLiquidNetWorthDelta(100, AccountType.ASSET, TransactionType.DEBIT)).toBe(100);
      expect(getLiquidNetWorthDelta(100, AccountType.ASSET, TransactionType.CREDIT)).toBe(-100);
    });

    test('Net Worth Impact - Liabilities: Credit (-Debt↑), Debit (+Debt↓)', () => {
      // Note: Credit to Liability increases balance (debt), which decreases Net Worth.
      expect(getLiquidNetWorthDelta(100, AccountType.LIABILITY, TransactionType.CREDIT)).toBe(-100);
      // Note: Debit to Liability decreases balance (debt), which increases Net Worth.
      expect(getLiquidNetWorthDelta(100, AccountType.LIABILITY, TransactionType.DEBIT)).toBe(100);
    });
  });

  describe('Cross-Model Consistency', () => {
    test('Transfer from Bank to Credit Card', () => {
      const amount = 1000;

      // Leg 1: Cash Account (Asset)
      const cashImpact = getLiquidNetWorthDelta(amount, AccountType.ASSET, TransactionType.CREDIT);
      expect(cashImpact).toBe(-1000); // Outflow

      // Leg 2: Credit Card (Liability)
      const ccImpact = getLiquidNetWorthDelta(amount, AccountType.LIABILITY, TransactionType.DEBIT);
      expect(ccImpact).toBe(1000); // Inflow (Debt reduction)

      // Net change to simulated balance (Liquid Assets - Liabilities)
      expect(cashImpact + ccImpact).toBe(0);
    });

    test('Spending on Credit Card', () => {
      const amount = 50;

      // Leg 1: Credit Card (Liability) - Spending increases debt (CREDIT)
      const ccImpact = getLiquidNetWorthDelta(
        amount,
        AccountType.LIABILITY,
        TransactionType.CREDIT,
      );
      expect(ccImpact).toBe(-50); // Reduction in net worth

      // Leg 2: Expense Account
      const expImpact = getAccountBalanceDelta(amount, AccountType.EXPENSE, TransactionType.DEBIT);
      expect(expImpact).toBe(50); // Increase in accumulated expense
    });
  });
});
