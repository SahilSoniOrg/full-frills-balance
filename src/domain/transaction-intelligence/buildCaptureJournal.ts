import { JournalStatus, TransactionType } from '@/src/types/enums';
import type { AccountId } from '@/src/types/ids';
import type { CreateJournalData } from '@/src/types/journalWrite';
import {
  withCaptureMetadata,
  type CaptureMetadata,
  type CaptureSourceObservation,
} from './captureMetadata';

interface CaptureJournalInput {
  economicKind: 'expense' | 'income' | 'transfer';
  financialAccountId: AccountId;
  counterAccountId: AccountId;
  uncategorizedAccountId?: AccountId;
  categoryOrigin?: 'uncategorized' | 'default';
  amount: number;
  currencyCode: string;
  occurredAt: number;
  merchant?: string;
  source: CaptureSourceObservation;
}

/** Balanced proposal from resolved facts; persistence retains final validation. */
export function buildCaptureJournal(input: CaptureJournalInput): CreateJournalData {
  const outgoing = input.economicKind !== 'income';
  const categorySide = outgoing ? TransactionType.DEBIT : TransactionType.CREDIT;
  const capture: CaptureMetadata = {
    version: 1,
    merchant: input.merchant,
    economicKind: input.economicKind,
    reviewState: input.economicKind === 'transfer' ? 'not_applicable' : 'needs_categorization',
    allocations:
      input.economicKind === 'transfer'
        ? []
        : [
            {
              accountId: input.counterAccountId,
              amount: input.amount,
              transactionType: categorySide,
              currencyCode: input.currencyCode,
              origin: input.categoryOrigin ?? 'uncategorized',
            },
          ],
    uncategorizedAccountIds:
      input.economicKind === 'transfer'
        ? []
        : [input.uncategorizedAccountId ?? input.counterAccountId],
    sources: [{ ...input.source, merchant: input.source.merchant ?? input.merchant }],
  };
  return {
    journalDate: input.occurredAt,
    description: input.merchant || `Captured ${input.economicKind}`,
    currencyCode: input.currencyCode,
    status: JournalStatus.POSTED,
    metadata: {
      importSource: input.source.channel,
      metadataJson: withCaptureMetadata(undefined, capture),
    },
    transactions: [
      {
        accountId: input.financialAccountId,
        amount: input.amount,
        currencyCode: input.currencyCode,
        transactionType: outgoing ? TransactionType.CREDIT : TransactionType.DEBIT,
      },
      {
        accountId: input.counterAccountId,
        amount: input.amount,
        currencyCode: input.currencyCode,
        transactionType: categorySide,
      },
    ],
  };
}
