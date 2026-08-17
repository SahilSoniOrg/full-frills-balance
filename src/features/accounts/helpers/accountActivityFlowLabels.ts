import { AccountType } from '@/src/types/domain';

export function getAccountActivityFlowLabels(accountType: string): {
  increaseLabel: string;
  decreaseLabel: string;
} {
  if (accountType === AccountType.LIABILITY || accountType === 'CREDIT_CARD') {
    return { increaseLabel: 'Total Spent', decreaseLabel: 'Total Paid' };
  }
  if (accountType === AccountType.EXPENSE) {
    return { increaseLabel: 'Month Spent', decreaseLabel: 'Refunds / Credits' };
  }
  return { increaseLabel: 'Total In', decreaseLabel: 'Total Out' };
}
