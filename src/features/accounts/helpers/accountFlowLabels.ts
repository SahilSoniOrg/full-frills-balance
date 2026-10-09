import { AccountType } from '@/src/types/enums';
import { isCategoryAccountType } from '@/src/utils/accountCategory';

/** Account details copy: categories accumulate spending or earnings rather than holding a balance. */
export function accountDetailsCopy(accountType: AccountType) {
  const entity = isCategoryAccountType(accountType) ? ('Category' as const) : ('Account' as const);
  if (accountType === AccountType.EXPENSE) {
    return {
      entity,
      balanceLabel: 'Spent all time',
      chartTitle: 'Spending so far',
      chartLine: 'Spent',
    };
  }
  if (accountType === AccountType.INCOME) {
    return {
      entity,
      balanceLabel: 'Earned all time',
      chartTitle: 'Earnings so far',
      chartLine: 'Earned',
    };
  }
  return {
    entity,
    balanceLabel: 'Current balance',
    chartTitle: 'Balance over time',
    chartLine: 'Balance',
  };
}

export type AccountFlowLabelKey = AccountType | 'CREDIT_CARD' | undefined;

type AccountFlowLabels = {
  statsLeftLabel: string;
  statsRightLabel: string;
  statsSwapAmounts: boolean;
};

export function accountFlowLabels(accountType: AccountFlowLabelKey): AccountFlowLabels {
  if (accountType === AccountType.LIABILITY || accountType === 'CREDIT_CARD') {
    return {
      statsLeftLabel: 'PAYMENTS MADE',
      statsRightLabel: 'NEW CHARGES',
      statsSwapAmounts: true,
    };
  }
  if (accountType === AccountType.EXPENSE) {
    return {
      statsLeftLabel: 'MONTH SPENT',
      statsRightLabel: 'REFUNDS / CREDITS',
      statsSwapAmounts: false,
    };
  }
  if (accountType === AccountType.INCOME) {
    return {
      statsLeftLabel: 'MONTH EARNED',
      statsRightLabel: 'ADJUSTMENTS',
      statsSwapAmounts: false,
    };
  }
  if (accountType === AccountType.EQUITY) {
    return {
      statsLeftLabel: 'ADDITIONS',
      statsRightLabel: 'REDUCTIONS',
      statsSwapAmounts: false,
    };
  }
  return {
    statsLeftLabel: 'MONEY IN',
    statsRightLabel: 'MONEY OUT',
    statsSwapAmounts: false,
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
