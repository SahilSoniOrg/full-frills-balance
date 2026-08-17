import { AccountType } from '@/src/types/domain';

import { getAccountStatsConfig } from '../accountCardStatsConfig';

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

describe('getAccountStatsConfig', () => {
  it('maps an expense debit (period increase) to Month Spent, not Refunds / Credits', () => {
    expect(getAccountStatsConfig(AccountType.EXPENSE, 1341, 0)).toEqual({
      leftLabel: 'MONTH SPENT',
      leftAmount: 1341,
      rightLabel: 'REFUNDS / CREDITS',
      rightAmount: 0,
    });
  });

  it('maps expense credits (period decrease) to Refunds / Credits without mixing them into Month Spent', () => {
    expect(getAccountStatsConfig(AccountType.EXPENSE, 1341, 50)).toEqual({
      leftLabel: 'MONTH SPENT',
      leftAmount: 1341,
      rightLabel: 'REFUNDS / CREDITS',
      rightAmount: 50,
    });
  });

  it('locks labels and amount sides for every account type', () => {
    expect(Object.keys(expectedStatsByType).sort()).toEqual(Object.values(AccountType).sort());

    for (const accountType of Object.values(AccountType)) {
      expect(getAccountStatsConfig(accountType, INCREASE, DECREASE)).toEqual(
        expectedStatsByType[accountType],
      );
    }
  });

  it('treats an unknown type like an asset (Money In / Money Out)', () => {
    expect(getAccountStatsConfig(undefined, INCREASE, DECREASE)).toEqual(
      expectedStatsByType[AccountType.ASSET],
    );
  });
});
