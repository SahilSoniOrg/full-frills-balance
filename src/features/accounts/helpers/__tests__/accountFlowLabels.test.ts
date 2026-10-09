import { AccountType } from '@/src/types/enums';

import { accountFlowLabels, getAccountStatsConfig } from '../accountFlowLabels';

const INCREASE = 10;
const DECREASE = 3;

const expectedStatsByType: Record<
  AccountType,
  { leftLabel: string; leftAmount: number; rightLabel: string; rightAmount: number }
> = {
  [AccountType.ASSET]: {
    leftLabel: 'MONEY IN',
    leftAmount: INCREASE,
    rightLabel: 'MONEY OUT',
    rightAmount: DECREASE,
  },
  [AccountType.LIABILITY]: {
    leftLabel: 'PAYMENTS MADE',
    leftAmount: DECREASE,
    rightLabel: 'NEW CHARGES',
    rightAmount: INCREASE,
  },
  [AccountType.EQUITY]: {
    leftLabel: 'ADDITIONS',
    leftAmount: INCREASE,
    rightLabel: 'REDUCTIONS',
    rightAmount: DECREASE,
  },
  [AccountType.INCOME]: {
    leftLabel: 'MONTH EARNED',
    leftAmount: INCREASE,
    rightLabel: 'ADJUSTMENTS',
    rightAmount: DECREASE,
  },
  [AccountType.EXPENSE]: {
    leftLabel: 'MONTH SPENT',
    leftAmount: INCREASE,
    rightLabel: 'REFUNDS / CREDITS',
    rightAmount: DECREASE,
  },
};

describe('accountFlowLabels', () => {
  it.each(Object.values(AccountType))('exposes stats labels for %s', accountType => {
    expect(getAccountStatsConfig(accountType, INCREASE, DECREASE)).toEqual(
      expectedStatsByType[accountType],
    );
    expect(accountFlowLabels(accountType).statsLeftLabel).toBe(
      expectedStatsByType[accountType].leftLabel,
    );
  });

  it.each([
    [1341, 0],
    [1341, 50],
  ] as const)(
    'maps expense debits and credits to distinct stat sides (%s / %s)',
    (spent, refunds) => {
      expect(getAccountStatsConfig(AccountType.EXPENSE, spent, refunds)).toEqual({
        leftLabel: 'MONTH SPENT',
        leftAmount: spent,
        rightLabel: 'REFUNDS / CREDITS',
        rightAmount: refunds,
      });
    },
  );

  it('treats an unknown type like an asset for stats', () => {
    expect(getAccountStatsConfig(undefined, INCREASE, DECREASE)).toEqual(
      expectedStatsByType[AccountType.ASSET],
    );
  });

  it('keeps the legacy credit-card alias on liability stats labels', () => {
    expect(accountFlowLabels('CREDIT_CARD')).toMatchObject({
      statsLeftLabel: 'PAYMENTS MADE',
      statsRightLabel: 'NEW CHARGES',
    });
  });
});
