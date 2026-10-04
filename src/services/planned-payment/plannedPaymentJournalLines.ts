import PlannedPayment from '@/src/data/models/PlannedPayment';
import { TransactionType } from '@/src/types/enums';
import { AccountId } from '@/src/types/ids';

import { Money } from '@/src/utils/money';

export interface PlannedPaymentJournalLine {
  accountId: AccountId;
  amount: number;
  transactionType: TransactionType;
  notes?: string;
  currencyCode?: string;
  exchangeRate?: number;
}

export function buildPlannedPaymentTransferLines(
  pp: Pick<
    PlannedPayment,
    'amount' | 'currencyCode' | 'fromAccountId' | 'toAccountId' | 'description'
  >,
  options?: { includeNotes?: boolean; includeCurrency?: boolean },
): PlannedPaymentJournalLine[] {
  const amount = Money.from(pp.amount, pp.currencyCode);
  const includeNotes = options?.includeNotes !== false;
  const includeCurrency = options?.includeCurrency !== false;

  const extras: Partial<Pick<PlannedPaymentJournalLine, 'notes' | 'currencyCode'>> = {};
  if (includeNotes) extras.notes = pp.description;
  if (includeCurrency) extras.currencyCode = amount.currencyCode;

  return [
    {
      accountId: pp.fromAccountId,
      amount: amount.amount,
      transactionType: TransactionType.CREDIT,
      ...extras,
    },
    {
      accountId: pp.toAccountId!,
      amount: amount.amount,
      transactionType: TransactionType.DEBIT,
      ...extras,
    },
  ];
}

/** Source-currency basis; the destination rate balances the rounded native amounts exactly. */
export function buildPlannedPaymentFxLines(
  lines: readonly PlannedPaymentJournalLine[],
  sourceCurrency: string,
  destinationCurrency: string,
  sourceAmount: number,
  destinationAmount: number,
): PlannedPaymentJournalLine[] {
  return lines.map(line =>
    line.transactionType === TransactionType.CREDIT
      ? { ...line, amount: sourceAmount, currencyCode: sourceCurrency, exchangeRate: 1 }
      : {
          ...line,
          amount: destinationAmount,
          currencyCode: destinationCurrency,
          exchangeRate: sourceAmount / destinationAmount,
        },
  );
}
