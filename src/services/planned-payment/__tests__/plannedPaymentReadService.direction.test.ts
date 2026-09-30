import { AccountType } from '@/src/types/enums';
import { classifyPlannedPaymentDirection } from '../plannedPaymentReadService';

describe('planned-payment account direction', () => {
  it.each([
    [AccountType.INCOME, AccountType.ASSET, 'inflow'],
    [AccountType.ASSET, AccountType.EXPENSE, 'outflow'],
    [AccountType.ASSET, AccountType.ASSET, 'transfer'],
    [AccountType.EXPENSE, AccountType.ASSET, 'inflow'],
    [AccountType.ASSET, AccountType.LIABILITY, 'outflow'],
    [AccountType.LIABILITY, AccountType.ASSET, 'inflow'],
    [AccountType.INCOME, AccountType.EXPENSE, 'unknown'],
  ] as const)('%s → %s is %s', (from, to, expected) => {
    expect(classifyPlannedPaymentDirection(from, to)).toBe(expected);
  });
});
