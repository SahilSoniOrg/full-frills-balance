import { IconMap, IconName } from '@/src/components/core/AppIcon';
import { AccountType } from '@/src/data/models/Account';

export interface AccountSuggestion {
    name: string;
    icon: IconName;
    type: AccountType;
    isCustom?: boolean;
}

export interface CategorySuggestion {
    name: string;
    icon: IconName;
    type: 'INCOME' | 'EXPENSE';
    isCustom?: boolean;
}

export const DEFAULT_ACCOUNTS: AccountSuggestion[] = ([
    { name: 'Cash', icon: 'wallet', type: AccountType.ASSET },
    { name: 'Bank', icon: 'bank', type: AccountType.ASSET },
    { name: 'Savings', icon: 'safe', type: AccountType.ASSET },
    { name: 'Revolut', icon: 'creditCard', type: AccountType.ASSET },
] as const).map(acc => ({
    ...acc,
    icon: (IconMap[acc.icon] ? acc.icon : 'wallet') as IconName
}));

export const DEFAULT_CATEGORIES: CategorySuggestion[] = ([
    { name: 'Salary', icon: 'trendingUp', type: 'INCOME' },
    { name: 'Work', icon: 'briefcase', type: 'INCOME' },
    { name: 'Food & Drink', icon: 'coffee', type: 'EXPENSE' },
    { name: 'Groceries', icon: 'shoppingCart', type: 'EXPENSE' },
    { name: 'Transportation', icon: 'bus', type: 'EXPENSE' },
    { name: 'Entertainment', icon: 'film', type: 'EXPENSE' },
    { name: 'Shopping', icon: 'shoppingBag', type: 'EXPENSE' },
    { name: 'Bills', icon: 'document', type: 'EXPENSE' },
] as const).map(cat => ({
    ...cat,
    icon: (IconMap[cat.icon] ? cat.icon : 'tag') as IconName
}));
