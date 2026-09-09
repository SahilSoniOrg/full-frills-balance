import { Icon, type IconName } from '@/src/types/domainIcons';
import { AccountType } from '@/src/types/enums';

export interface AccountSuggestion {
  id: string;
  name: string;
  icon: IconName;
  type: AccountType;
  isCustom?: boolean;
}

export interface CategorySuggestion {
  id: string;
  name: string;
  icon: IconName;
  type: 'INCOME' | 'EXPENSE';
  isCustom?: boolean;
}

export const DEFAULT_ACCOUNTS: AccountSuggestion[] = [
  { id: 'cash', name: 'Cash', icon: Icon.Wallet, type: AccountType.ASSET },
  { id: 'bank', name: 'Bank', icon: Icon.Bank, type: AccountType.ASSET },
  { id: 'savings', name: 'Savings', icon: Icon.Safe, type: AccountType.ASSET },
  { id: 'revolut', name: 'Revolut', icon: Icon.CreditCard, type: AccountType.ASSET },
  { id: 'credit_card', name: 'Credit Card', icon: Icon.CreditCard, type: AccountType.LIABILITY },
  { id: 'loan', name: 'Loan', icon: Icon.Receipt, type: AccountType.LIABILITY },
];

export const DEFAULT_CATEGORIES: CategorySuggestion[] = [
  { id: 'salary', name: 'Salary', icon: Icon.TrendingUp, type: 'INCOME' },
  { id: 'work', name: 'Work', icon: Icon.Briefcase, type: 'INCOME' },
  { id: 'food_drink', name: 'Food & Drink', icon: Icon.Coffee, type: 'EXPENSE' },
  { id: 'groceries', name: 'Groceries', icon: Icon.ShoppingCart, type: 'EXPENSE' },
  { id: 'transportation', name: 'Bus & Train', icon: Icon.Bus, type: 'EXPENSE' },
  { id: 'entertainment', name: 'Entertainment', icon: Icon.Film, type: 'EXPENSE' },
  { id: 'shopping', name: 'Shopping', icon: Icon.ShoppingBag, type: 'EXPENSE' },
  { id: 'bills', name: 'Bills', icon: Icon.Document, type: 'EXPENSE' },
];
