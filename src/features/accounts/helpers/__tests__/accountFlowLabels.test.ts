import { AccountType } from '@/src/types/enums';

import {
  accountFlowLabels,
  getAccountStatsConfig,
} from '../accountFlowLabels';

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

const expectedActivityByType: Record<AccountType, { increaseLabel: string; decreaseLabel: string }> =
  {
    [AccountType.ASSET]: { increaseLabel: 'Total In', decreaseLabel: 'Total Out' },
    [AccountType.LIABILITY]: { increaseLabel: 'Total Spent', decreaseLabel: 'Total Paid' },
    [AccountType.EQUITY]: { increaseLabel: 'Total In', decreaseLabel: 'Total Out' },
    [AccountType.INCOME]: { increaseLabel: 'Total In', decreaseLabel: 'Total Out' },
    [AccountType.EXPENSE]: { increaseLabel: 'Month Spent', decreaseLabel: 'Refunds / Credits' },
  };

describe('accountFlowLabels', () => {
  it.each(Object.values(AccountType))('exposes stats and activity labels for %s', accountType => {
    const flow = accountFlowLabels(accountType);
    expect(getAccountStatsConfig(accountType, INCREASE, DECREASE)).toEqual(
      expectedStatsByType[accountType],
    );
    expect(flow).toMatchObject(expectedActivityByType[accountType]);
    expect(flow.statsLeftLabel).toBe(expectedStatsByType[accountType].leftLabel);
  });

  it('maps expense debits and credits to distinct stat sides', () => {
    expect(getAccountStatsConfig(AccountType.EXPENSE, 1341, 0)).toEqual({
      leftLabel: 'MONTH SPENT',
      leftAmount: 1341,
      rightLabel: 'REFUNDS / CREDITS',
      rightAmount: 0,
    });
    expect(getAccountStatsConfig(AccountType.EXPENSE, 1341, 50)).toEqual({
      leftLabel: 'MONTH SPENT',
      leftAmount: 1341,
      rightLabel: 'REFUNDS / CREDITS',
      rightAmount: 50,
    });
  });

  it('treats an unknown type like an asset for stats', () => {
    expect(getAccountStatsConfig(undefined, INCREASE, DECREASE)).toEqual(
      expectedStatsByType[AccountType.ASSET],
    );
  });

  it('keeps the legacy credit-card alias on liability activity labels', () => {
    expect(accountFlowLabels('CREDIT_CARD')).toMatchObject({
      increaseLabel: 'Total Spent',
      decreaseLabel: 'Total Paid',
    });
  });
});
