import { AccountType } from '@/src/types/enums';
import { AccountId } from '@/src/types/ids';

import {
  calculateCategoryBreakdownItems,
  calculateIncomeVsExpenseSummary,
} from '@/src/services/accounting/accountingHelpers';

describe('accountingHelpers aggregates', () => {
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
