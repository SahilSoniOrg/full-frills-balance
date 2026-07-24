import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import {
  calculateAccountPeriodFlows,
  calculateCategoryBreakdownItems,
  calculateIncomeVsExpenseSummary,
  getBalanceImpactMultiplier,
  isBalanceIncrease,
  isValueEntering,
  isValueLeaving,
  validateBalance,
} from '@/src/services/accounting/accountingHelpers';

describe('accounting-utils', () => {
  describe('getBalanceImpactMultiplier', () => {
    it('should return 1 for Asset/Expense Debit', () => {
      expect(getBalanceImpactMultiplier(AccountType.ASSET, TransactionType.DEBIT)).toBe(1);
      expect(getBalanceImpactMultiplier(AccountType.EXPENSE, TransactionType.DEBIT)).toBe(1);
    });

    it('should return -1 for Asset/Expense Credit', () => {
      expect(getBalanceImpactMultiplier(AccountType.ASSET, TransactionType.CREDIT)).toBe(-1);
      expect(getBalanceImpactMultiplier(AccountType.EXPENSE, TransactionType.CREDIT)).toBe(-1);
    });

    it('should return 1 for Liability/Equity/Income Credit', () => {
      expect(getBalanceImpactMultiplier(AccountType.LIABILITY, TransactionType.CREDIT)).toBe(1);
      expect(getBalanceImpactMultiplier(AccountType.EQUITY, TransactionType.CREDIT)).toBe(1);
      expect(getBalanceImpactMultiplier(AccountType.INCOME, TransactionType.CREDIT)).toBe(1);
    });

    it('should return -1 for Liability/Equity/Income Debit', () => {
      expect(getBalanceImpactMultiplier(AccountType.LIABILITY, TransactionType.DEBIT)).toBe(-1);
      expect(getBalanceImpactMultiplier(AccountType.EQUITY, TransactionType.DEBIT)).toBe(-1);
      expect(getBalanceImpactMultiplier(AccountType.INCOME, TransactionType.DEBIT)).toBe(-1);
    });

    it('should return 0 for unknown account type', () => {
      expect(getBalanceImpactMultiplier('UNKNOWN' as any, TransactionType.DEBIT)).toBe(0);
    });
  });

  describe('isBalanceIncrease', () => {
    it('should correctly identify increases', () => {
      expect(isBalanceIncrease(AccountType.ASSET, TransactionType.DEBIT)).toBe(true);
      expect(isBalanceIncrease(AccountType.LIABILITY, TransactionType.CREDIT)).toBe(true);
      expect(isBalanceIncrease(AccountType.ASSET, TransactionType.CREDIT)).toBe(false);
      expect(isBalanceIncrease(AccountType.LIABILITY, TransactionType.DEBIT)).toBe(false);
    });
  });

  describe('Value Direction', () => {
    it('isValueEntering should be true for DEBIT', () => {
      expect(isValueEntering(TransactionType.DEBIT)).toBe(true);
      expect(isValueEntering(TransactionType.CREDIT)).toBe(false);
    });

    it('isValueLeaving should be true for CREDIT', () => {
      expect(isValueLeaving(TransactionType.CREDIT)).toBe(true);
      expect(isValueLeaving(TransactionType.DEBIT)).toBe(false);
    });
  });

  describe('validateBalance', () => {
    it('should validate balanced lines', () => {
      const lines = [
        { amount: 100, type: TransactionType.DEBIT },
        { amount: 100, type: TransactionType.CREDIT },
      ];
      const result = validateBalance(lines);
      expect(result.isValid).toBe(true);
      expect(result.imbalance).toBe(0);
      expect(result.totalDebits).toBe(100);
      expect(result.totalCredits).toBe(100);
    });

    it('should detect unbalanced lines', () => {
      const lines = [
        { amount: 100, type: TransactionType.DEBIT },
        { amount: 90, type: TransactionType.CREDIT },
      ];
      const result = validateBalance(lines);
      expect(result.isValid).toBe(false);
      expect(result.imbalance).toBe(10);
    });

    it('should handle exchange rates', () => {
      const lines = [
        { amount: 100, type: TransactionType.DEBIT, exchangeRate: 1.2 }, // 120
        { amount: 120, type: TransactionType.CREDIT }, // 120
      ];
      const result = validateBalance(lines);
      expect(result.isValid).toBe(true);
      expect(result.totalDebits).toBe(120);
    });

    it('should handle precision-aware imbalance', () => {
      const lines = [
        { amount: 100.001, type: TransactionType.DEBIT },
        { amount: 100, type: TransactionType.CREDIT },
      ];
      // With precision 2, 100.001 - 100 = 0.00 (rounded)
      const result = validateBalance(lines, 2);
      expect(result.isValid).toBe(true);
      expect(result.imbalance).toBe(0);
    });

    it('should respect precision argument for imbalance detection', () => {
      const lines = [
        { amount: 100.01, type: TransactionType.DEBIT },
        { amount: 100, type: TransactionType.CREDIT },
      ];
      // Precision 2: 0.01 is imbalance
      expect(validateBalance(lines, 2).isValid).toBe(false);
      // Precision 1: 0.01 rounds to 0.0
      expect(validateBalance(lines, 1).isValid).toBe(true);
    });
  });

  describe('calculateAccountPeriodFlows', () => {
    it('calculates gross increases, decreases, and net flow for Asset account', () => {
      const txs = [
        { amount: 500, transactionType: TransactionType.DEBIT }, // Inflow / Increase (+500)
        { amount: 120, transactionType: TransactionType.CREDIT }, // Outflow / Decrease (-120)
        { amount: 30, transactionType: TransactionType.CREDIT }, // Outflow / Decrease (-30)
      ];
      const flows = calculateAccountPeriodFlows(AccountType.ASSET, txs);
      expect(flows.totalIncrease).toBe(500);
      expect(flows.totalDecrease).toBe(150);
      expect(flows.netFlow).toBe(350);
    });

    it('calculates gross flows for Liability account', () => {
      const txs = [
        { amount: 1000, transactionType: TransactionType.CREDIT }, // Debt Increase (+1000)
        { amount: 200, transactionType: TransactionType.DEBIT }, // Repayment / Decrease (-200)
      ];
      const flows = calculateAccountPeriodFlows(AccountType.LIABILITY, txs);
      expect(flows.totalIncrease).toBe(1000);
      expect(flows.totalDecrease).toBe(200);
      expect(flows.netFlow).toBe(800);
    });
  });

  describe('calculateIncomeVsExpenseSummary', () => {
    it('calculates net savings and savings rate correctly', () => {
      const deltas = [
        { accountType: AccountType.INCOME, amount: 5000 },
        { accountType: AccountType.EXPENSE, amount: 3000 },
      ];
      const summary = calculateIncomeVsExpenseSummary(deltas);
      expect(summary.income).toBe(5000);
      expect(summary.expense).toBe(3000);
      expect(summary.netSavings).toBe(2000);
      expect(summary.savingsRate).toBe(40); // (2000 / 5000) * 100
    });

    it('handles zero income cleanly', () => {
      const deltas = [{ accountType: AccountType.EXPENSE, amount: 500 }];
      const summary = calculateIncomeVsExpenseSummary(deltas);
      expect(summary.income).toBe(0);
      expect(summary.expense).toBe(500);
      expect(summary.netSavings).toBe(-500);
      expect(summary.savingsRate).toBe(0);
    });
  });

  describe('calculateCategoryBreakdownItems', () => {
    it('aggregates amounts, calculates percentages, and sorts by highest amount', () => {
      const raw = [
        { category: 'Groceries', amount: 300 },
        { category: 'Rent', amount: 1200 },
        { category: 'Groceries', amount: 100 },
        { category: 'Entertainment', amount: 0 },
      ];
      const breakdown = calculateCategoryBreakdownItems(raw);
      expect(breakdown).toHaveLength(2);
      expect(breakdown[0]).toEqual({
        category: 'Rent',
        amount: 1200,
        percentage: 75, // 1200 / 1600
      });
      expect(breakdown[1]).toEqual({
        category: 'Groceries',
        amount: 400,
        percentage: 25, // 400 / 1600
      });
    });

    it('returns empty array when grand total is zero or negative', () => {
      expect(calculateCategoryBreakdownItems([])).toEqual([]);
      expect(calculateCategoryBreakdownItems([{ category: 'A', amount: 0 }])).toEqual([]);
    });
  });
});
