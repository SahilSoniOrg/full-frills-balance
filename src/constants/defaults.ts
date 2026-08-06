import { IconMap, IconName } from '@/src/components/core/AppIcon';
import { AccountType } from '@/src/types/domain';

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

export const DEFAULT_ACCOUNTS: AccountSuggestion[] = (
  [
    { id: 'cash', name: 'Cash', icon: 'wallet', type: AccountType.ASSET },
    { id: 'bank', name: 'Bank', icon: 'bank', type: AccountType.ASSET },
    { id: 'savings', name: 'Savings', icon: 'safe', type: AccountType.ASSET },
    { id: 'revolut', name: 'Revolut', icon: 'creditCard', type: AccountType.ASSET },
  ] as const
).map(acc => ({
  ...acc,
  icon: (IconMap[acc.icon] ? acc.icon : 'wallet') as IconName,
}));

export const DEFAULT_CATEGORIES: CategorySuggestion[] = (
  [
    { id: 'salary', name: 'Salary', icon: 'trendingUp', type: 'INCOME' },
    { id: 'work', name: 'Work', icon: 'briefcase', type: 'INCOME' },
    { id: 'food_drink', name: 'Food & Drink', icon: 'coffee', type: 'EXPENSE' },
    { id: 'groceries', name: 'Groceries', icon: 'shoppingCart', type: 'EXPENSE' },
    { id: 'transportation', name: 'Bus & Train', icon: 'bus', type: 'EXPENSE' },
    { id: 'entertainment', name: 'Entertainment', icon: 'film', type: 'EXPENSE' },
    { id: 'shopping', name: 'Shopping', icon: 'shoppingBag', type: 'EXPENSE' },
    { id: 'bills', name: 'Bills', icon: 'document', type: 'EXPENSE' },
  ] as const
).map(cat => ({
  ...cat,
  icon: (IconMap[cat.icon] ? cat.icon : 'tag') as IconName,
}));
