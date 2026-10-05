import { AccountType } from '@/src/types/enums';
import { asAccountId } from '@/src/types/ids';
import type { JournalSuggestion } from '@/src/types/journalSuggestions';

export const composerCashFoodAccounts = [
  { id: asAccountId('cash'), name: 'Cash', accountType: AccountType.ASSET, currencyCode: 'USD' },
  { id: asAccountId('food'), name: 'Food', accountType: AccountType.EXPENSE, currencyCode: 'USD' },
];

export const composerSessionAccounts = [
  { id: asAccountId('cash'), name: 'Cash', accountType: AccountType.ASSET, currencyCode: 'USD' },
  { id: asAccountId('bank'), name: 'Bank', accountType: AccountType.ASSET, currencyCode: 'USD' },
  { id: asAccountId('food'), name: 'Food', accountType: AccountType.EXPENSE, currencyCode: 'USD' },
  {
    id: asAccountId('salary'),
    name: 'Salary',
    accountType: AccountType.INCOME,
    currencyCode: 'USD',
  },
  { id: asAccountId('bonus'), name: 'Bonus', accountType: AccountType.INCOME, currencyCode: 'USD' },
];

export const incomeJournalSuggestion: JournalSuggestion = {
  key: 'salary-to-bank',
  description: 'Salary payment',
  route: {
    sources: [{ id: asAccountId('salary'), name: 'Salary', type: AccountType.INCOME }],
    destinations: [{ id: asAccountId('bank'), name: 'Bank', type: AccountType.ASSET }],
  },
  history: { count: 1, lastUsedAt: 1 },
};
