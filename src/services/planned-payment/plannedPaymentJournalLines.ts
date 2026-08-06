import PlannedPayment from '@/src/data/models/PlannedPayment';
import { TransactionType, AccountId } from '@/src/types/domain';

import { Money } from '@/src/utils/money';

export interface PlannedPaymentJournalLine {
  accountId: AccountId;
  amount: number;
  transactionType: TransactionType;
  notes?: string;
  currencyCode?: string;
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
