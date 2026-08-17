import { AccountType, TransactionType, AccountId } from '@/src/types/domain';

import {
  calculateAccountPeriodFlows,
  calculateCategoryBreakdownItems,
  calculateIncomeVsExpenseSummary,
} from '@/src/services/accounting/accountingHelpers';

describe('accountingHelpers aggregates', () => {
  describe('calculateAccountPeriodFlows', () => {
    it('calculates gross increases, decreases, and net flow for Asset account', () => {
      const txs = [
        { amount: 500, transactionType: TransactionType.DEBIT },
        { amount: 120, transactionType: TransactionType.CREDIT },
        { amount: 30, transactionType: TransactionType.CREDIT },
      ];
      const flows = calculateAccountPeriodFlows(AccountType.ASSET, txs);
      expect(flows.totalIncrease).toBe(500);
      expect(flows.totalDecrease).toBe(150);
      expect(flows.netFlow).toBe(350);
    });

    it('calculates gross flows for Liability account', () => {
      const txs = [
        { amount: 1000, transactionType: TransactionType.CREDIT },
        { amount: 200, transactionType: TransactionType.DEBIT },
      ];
      const flows = calculateAccountPeriodFlows(AccountType.LIABILITY, txs);
      expect(flows.totalIncrease).toBe(1000);
      expect(flows.totalDecrease).toBe(200);
      expect(flows.netFlow).toBe(800);
    });

    it('treats expense debits as period increase and credits as period decrease', () => {
      const txs = [
        { amount: 1341, transactionType: TransactionType.DEBIT },
        { amount: 50, transactionType: TransactionType.CREDIT },
      ];
      const flows = calculateAccountPeriodFlows(AccountType.EXPENSE, txs);
      expect(flows.totalIncrease).toBe(1341);
      expect(flows.totalDecrease).toBe(50);
      expect(flows.netFlow).toBe(1291);
    });

    it('treats income credits as period increase and debits as period decrease', () => {
      const txs = [
        { amount: 2000, transactionType: TransactionType.CREDIT },
        { amount: 25, transactionType: TransactionType.DEBIT },
      ];
      const flows = calculateAccountPeriodFlows(AccountType.INCOME, txs);
      expect(flows.totalIncrease).toBe(2000);
      expect(flows.totalDecrease).toBe(25);
      expect(flows.netFlow).toBe(1975);
    });

    it('treats equity credits as period increase and debits as period decrease', () => {
      const txs = [
        { amount: 400, transactionType: TransactionType.CREDIT },
        { amount: 50, transactionType: TransactionType.DEBIT },
      ];
      const flows = calculateAccountPeriodFlows(AccountType.EQUITY, txs);
      expect(flows.totalIncrease).toBe(400);
      expect(flows.totalDecrease).toBe(50);
      expect(flows.netFlow).toBe(350);
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
      expect(summary.savingsRate).toBe(40);
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
        { category: 'Groceries', amount: 300, accountId: 'acc-1' as AccountId },
        { category: 'Rent', amount: 1200, accountId: 'acc-2' as AccountId },
        { category: 'Groceries', amount: 100, accountId: 'acc-3' as AccountId },
        { category: 'Entertainment', amount: 0, accountId: 'acc-4' as AccountId },
      ];
      const breakdown = calculateCategoryBreakdownItems(raw);
      expect(breakdown).toHaveLength(2);
      expect(breakdown[0]).toEqual({
        category: 'Rent',
        amount: 1200,
        percentage: 75,
        accountIds: ['acc-2'],
      });
      expect(breakdown[1]).toEqual({
        category: 'Groceries',
        amount: 400,
        percentage: 25,
        accountIds: ['acc-1', 'acc-3'],
      });
    });

    it('returns empty array when grand total is zero or negative', () => {
      expect(calculateCategoryBreakdownItems([])).toEqual([]);
      expect(calculateCategoryBreakdownItems([{ category: 'A', amount: 0 }])).toEqual([]);
    });
  });
});
