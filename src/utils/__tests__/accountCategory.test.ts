import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/types/domain';
import { getAllowedAccountTypes, isBalanceSheetAccount } from '../accountCategory';

describe('accountCategory', () => {
  describe('isBalanceSheetAccount', () => {
    it('should return true for Asset, Liability, and Equity', () => {
      expect(isBalanceSheetAccount(AccountType.ASSET)).toBe(true);
      expect(isBalanceSheetAccount(AccountType.LIABILITY)).toBe(true);
      expect(isBalanceSheetAccount(AccountType.EQUITY)).toBe(true);
    });

    it('should return false for Income and Expense', () => {
      expect(isBalanceSheetAccount(AccountType.INCOME)).toBe(false);
      expect(isBalanceSheetAccount(AccountType.EXPENSE)).toBe(false);
    });
  });

  describe('getAllowedAccountTypes', () => {
    it('should allow all account types for transfer', () => {
      const allowed = getAllowedAccountTypes('transfer', TransactionType.DEBIT);
      expect(allowed).toContain(AccountType.ASSET);
      expect(allowed).toContain(AccountType.LIABILITY);
      expect(allowed).toContain(AccountType.EQUITY);
      expect(allowed).toContain(AccountType.INCOME);
      expect(allowed).toContain(AccountType.EXPENSE);
    });

    it('should return specific types for expense and income', () => {
      expect(getAllowedAccountTypes('expense', TransactionType.DEBIT)).toContain(
        AccountType.EXPENSE,
      );
      expect(getAllowedAccountTypes('income', TransactionType.CREDIT)).toContain(
        AccountType.INCOME,
      );
    });
  });
});
