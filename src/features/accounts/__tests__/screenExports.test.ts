import { AccountCreationScreen, CategoryCreationScreen } from '@/src/features/accounts';

jest.mock('@/src/features/accounts/components/CurrencySelector', () => ({
  CurrencySelector: 'CurrencySelector',
}));
jest.mock('@/src/features/accounts/screens/AccountCreationScreen', () => ({
  __esModule: true,
  default: 'AccountCreationScreen',
}));
jest.mock('@/src/features/accounts/screens/AccountDetailsScreen', () => ({
  __esModule: true,
  default: 'AccountDetailsScreen',
}));
jest.mock('@/src/features/accounts/screens/AccountManagementScreen', () => ({
  __esModule: true,
  default: 'AccountManagementScreen',
}));
jest.mock('@/src/features/accounts/screens/AccountsListScreen', () => ({
  __esModule: true,
  default: 'AccountsListScreen',
}));

describe('account creation screen exports', () => {
  it('keeps the category-creation route on the canonical account screen', () => {
    expect(CategoryCreationScreen).toBe(AccountCreationScreen);
  });
});
