import { AccountType } from '@/src/types/enums';

export type AccountFlowLabelKey = AccountType | 'CREDIT_CARD' | undefined;

type AccountFlowLabels = {
  statsLeftLabel: string;
  statsRightLabel: string;
  statsSwapAmounts: boolean;
  increaseLabel: string;
  decreaseLabel: string;
};

export function accountFlowLabels(accountType: AccountFlowLabelKey): AccountFlowLabels {
  if (accountType === AccountType.LIABILITY || accountType === 'CREDIT_CARD') {
    return {
      statsLeftLabel: 'PAYMENTS MADE',
      statsRightLabel: 'NEW CHARGES',
      statsSwapAmounts: true,
      increaseLabel: 'Total Spent',
      decreaseLabel: 'Total Paid',
    };
  }
  if (accountType === AccountType.EXPENSE) {
    return {
      statsLeftLabel: 'MONTH SPENT',
      statsRightLabel: 'REFUNDS / CREDITS',
      statsSwapAmounts: false,
      increaseLabel: 'Month Spent',
      decreaseLabel: 'Refunds / Credits',
    };
  }
  if (accountType === AccountType.INCOME) {
    return {
      statsLeftLabel: 'MONTH EARNED',
      statsRightLabel: 'ADJUSTMENTS',
      statsSwapAmounts: false,
      increaseLabel: 'Total In',
      decreaseLabel: 'Total Out',
    };
  }
  if (accountType === AccountType.EQUITY) {
    return {
      statsLeftLabel: 'ADDITIONS',
      statsRightLabel: 'REDUCTIONS',
      statsSwapAmounts: false,
      increaseLabel: 'Total In',
      decreaseLabel: 'Total Out',
    };
  }
  return {
    statsLeftLabel: 'MONEY IN',
    statsRightLabel: 'MONEY OUT',
    statsSwapAmounts: false,
    increaseLabel: 'Total In',
    decreaseLabel: 'Total Out',
  };
}

export function getAccountStatsConfig(
  accountType: AccountType | undefined,
  monthlyIncome: number,
  monthlyExpense: number,
) {
  const labels = accountFlowLabels(accountType);
  if (labels.statsSwapAmounts) {
    return {
      leftLabel: labels.statsLeftLabel,
      leftAmount: monthlyExpense,
      rightLabel: labels.statsRightLabel,
      rightAmount: monthlyIncome,
    };
  }
  return {
    leftLabel: labels.statsLeftLabel,
    leftAmount: monthlyIncome,
    rightLabel: labels.statsRightLabel,
    rightAmount: monthlyExpense,
  };
}
