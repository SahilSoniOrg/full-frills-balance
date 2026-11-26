import { safeAdd, toMinorUnits, fromMinorUnits } from '@/src/domain/money/money';
import { getCurrencyPrecision } from '@/src/domain/money/currencyPrecision';
import { AccountType, TransactionType } from '@/src/types/enums';
import type { AccountId } from '@/src/types/ids';
import type { JournalWriteLine } from '@/src/types/journalWrite';

export function equalSplit(total: number, count: number, currency: string): number[] {
  if (count < 1) throw new Error('participants required');
  const precision = getCurrencyPrecision(currency);
  const units = toMinorUnits(total, precision);
  const base = Math.floor(units / count);
  const remainder = units % count;
  return Array.from({ length: count }, (_, i) =>
    fromMinorUnits(base + (i < remainder ? 1 : 0), precision),
  );
}

export function customSplit(total: number, shares: readonly number[], currency: string): number[] {
  const precision = getCurrencyPrecision(currency);
  if (
    shares.reduce((sum, share) => sum + toMinorUnits(share, precision), 0) !==
    toMinorUnits(total, precision)
  ) {
    throw new Error('shares do not equal total');
  }
  return shares.map(share => fromMinorUnits(toMinorUnits(share, precision), precision));
}

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

export function buildUserPaidSplit(input: {
  fundingAccountId: AccountId;
  expenseAccountId: AccountId;
  participantReceivableIds: readonly AccountId[];
  shares: readonly number[];
  currencyCode: string;
}): JournalWriteLine[] {
  if (input.shares.length !== input.participantReceivableIds.length + 1)
    throw new Error('share count mismatch');
  const precision = getCurrencyPrecision(input.currencyCode);
  const total = input.shares.reduce((sum, share) => safeAdd(sum, share, precision), 0);
  const lines: JournalWriteLine[] = [];
  if (input.shares[0]! > 0)
    lines.push({
      accountId: input.expenseAccountId,
      amount: input.shares[0]!,
      transactionType: TransactionType.DEBIT,
      currencyCode: input.currencyCode,
    });
  input.shares.slice(1).forEach((amount, index) => {
    if (amount > 0)
      lines.push({
        accountId: input.participantReceivableIds[index]!,
        amount,
        transactionType: TransactionType.DEBIT,
        currencyCode: input.currencyCode,
      });
  });
  lines.push({
    accountId: input.fundingAccountId,
    amount: total,
    transactionType: TransactionType.CREDIT,
    currencyCode: input.currencyCode,
  });
  return lines;
}

export function buildFriendPaidSplit(input: {
  expenseAccountId: AccountId;
  personAccountId: AccountId;
  userShare: number;
  personShare: number;
  repayable: boolean;
  currencyCode: string;
}): JournalWriteLine[] {
  const lines: JournalWriteLine[] = [];
  if (input.userShare > 0)
    lines.push({
      accountId: input.expenseAccountId,
      amount: input.userShare,
      transactionType: TransactionType.DEBIT,
      currencyCode: input.currencyCode,
    });
  if (input.personShare > 0)
    lines.push({
      accountId: input.personAccountId,
      amount: input.personShare,
      transactionType: TransactionType.CREDIT,
      currencyCode: input.currencyCode,
    });
  return lines;
}

export function buildDirectPersonMovement(input: {
  accountId: AccountId;
  amount: number;
  flow: 'lend' | 'gift_paid' | 'borrow' | 'gift_received';
  currencyCode: string;
  counterAccountId: AccountId;
}): JournalWriteLine[] {
  const personSide: Record<typeof input.flow, { type: AccountType; transaction: TransactionType }> =
    {
      lend: { type: AccountType.ASSET, transaction: TransactionType.DEBIT },
      gift_paid: { type: AccountType.EXPENSE, transaction: TransactionType.DEBIT },
      borrow: { type: AccountType.LIABILITY, transaction: TransactionType.CREDIT },
      gift_received: { type: AccountType.INCOME, transaction: TransactionType.CREDIT },
    };
  const person = personSide[input.flow];
  return [
    {
      accountId: input.accountId,
      amount: input.amount,
      transactionType: person.transaction,
      currencyCode: input.currencyCode,
    },
    {
      accountId: input.counterAccountId,
      amount: input.amount,
      transactionType:
        person.transaction === TransactionType.DEBIT
          ? TransactionType.CREDIT
          : TransactionType.DEBIT,
      currencyCode: input.currencyCode,
    },
  ];
}
