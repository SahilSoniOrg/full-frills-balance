import { AccountType } from '@/src/types/domain';

export function getAccountStatsConfig(
  accountType: AccountType | undefined,
  monthlyIncome: number,
  monthlyExpense: number,
) {
  switch (accountType) {
    case AccountType.EXPENSE:
      return {
        leftLabel: 'MONTH SPENT',
        leftAmount: monthlyIncome,
        rightLabel: 'REFUNDS / CREDITS',
        rightAmount: monthlyExpense,
      };
    case AccountType.INCOME:
      return {
        leftLabel: 'MONTH EARNED',
        leftAmount: monthlyIncome,
        rightLabel: 'ADJUSTMENTS',
        rightAmount: monthlyExpense,
      };
    case AccountType.LIABILITY:
      return {
        leftLabel: 'PAYMENTS MADE',
        leftAmount: monthlyExpense,
        rightLabel: 'NEW CHARGES',
        rightAmount: monthlyIncome,
      };
    case AccountType.EQUITY:
      return {
        leftLabel: 'ADDITIONS',
        leftAmount: monthlyIncome,
        rightLabel: 'REDUCTIONS',
        rightAmount: monthlyExpense,
      };
    case AccountType.ASSET:
    default:
      return {
        leftLabel: 'MONEY IN',
        leftAmount: monthlyIncome,
        rightLabel: 'MONEY OUT',
        rightAmount: monthlyExpense,
      };
  }
}
