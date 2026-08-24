import { AccountType } from '@/src/types/enums';

import { getAccountActivityFlowLabels } from '../accountActivityFlowLabels';

const expectedLabelsByType: Record<AccountType, { increaseLabel: string; decreaseLabel: string }> =
  {
    [AccountType.ASSET]: { increaseLabel: 'Total In', decreaseLabel: 'Total Out' },
    [AccountType.LIABILITY]: { increaseLabel: 'Total Spent', decreaseLabel: 'Total Paid' },
    [AccountType.EQUITY]: { increaseLabel: 'Total In', decreaseLabel: 'Total Out' },
    [AccountType.INCOME]: { increaseLabel: 'Total In', decreaseLabel: 'Total Out' },
    [AccountType.EXPENSE]: { increaseLabel: 'Month Spent', decreaseLabel: 'Refunds / Credits' },
  };

describe('getAccountActivityFlowLabels', () => {
  it('locks details-page flow labels for every account type', () => {
    expect(Object.keys(expectedLabelsByType).sort()).toEqual(Object.values(AccountType).sort());

    for (const accountType of Object.values(AccountType)) {
      expect(getAccountActivityFlowLabels(accountType)).toEqual(expectedLabelsByType[accountType]);
    }
  });

  it('keeps the legacy credit-card alias on the liability labels', () => {
    expect(getAccountActivityFlowLabels('CREDIT_CARD')).toEqual({
      increaseLabel: 'Total Spent',
      decreaseLabel: 'Total Paid',
    });
  });
});
