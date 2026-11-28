import { AccountType } from '@/src/types/enums';

export function isEligiblePostedExpense(
  lines: readonly { accountType: AccountType; currencyCode: string }[],
  journalCurrency: string,
  alreadyShared = false,
): boolean {
  return (
    alreadyShared ||
    (lines.length === 2 &&
      lines.filter(line => line.accountType === AccountType.EXPENSE).length === 1 &&
      lines.filter(line => [AccountType.ASSET, AccountType.LIABILITY].includes(line.accountType))
        .length === 1 &&
      lines.every(line => line.currencyCode === journalCurrency))
  );
}
