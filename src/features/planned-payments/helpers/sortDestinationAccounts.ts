import { AccountType } from '@/src/types/enums';
import type { PlainAccount } from '@/src/types/plainDtos';

const destinationPriority: Partial<Record<AccountType, number>> = {
  [AccountType.EXPENSE]: 0,
  [AccountType.LIABILITY]: 1,
  [AccountType.ASSET]: 2,
};

/** Sorts destination choices by their role while preserving order within each type. */
export function sortDestinationAccounts<T extends Pick<PlainAccount, 'accountType'>>(
  accounts: readonly T[],
): T[] {
  return accounts
    .map((account, index) => ({ account, index }))
    .sort((left, right) => {
      const leftPriority = destinationPriority[left.account.accountType] ?? 3;
      const rightPriority = destinationPriority[right.account.accountType] ?? 3;
      return leftPriority - rightPriority || left.index - right.index;
    })
    .map(({ account }) => account);
}
