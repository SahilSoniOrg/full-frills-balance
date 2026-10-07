import { InboxProcessingStatus, TransactionDirection } from '@/src/types/enums';
import { safeParseJSON } from '@/src/utils/serialization';

export interface SmsJournalInfoDisplay {
  sender?: string;
  rawBody?: string;
  amount?: number;
  currencyCode?: string;
  referenceNumber?: string;
  accountSource?: string;
  inboxRecordId?: string;
  merchant?: string;
  autoPosted?: boolean;
  receivedAt?: number;
  amountColor?: 'income' | 'expense';
}

interface SmsMetadataFields {
  parsedAmount?: number;
  parsedCurrencyCode?: string;
  referenceNumber?: string;
  accountSource?: string;
  parsedMerchant?: string;
}

export function mapSmsJournalMetadataDisplay(input: {
  originalSmsSender?: string | null;
  originalSmsBody?: string | null;
  metadataJson?: string | null;
  inboxRecord?: {
    referenceNumber?: string;
    parsedAccountSource?: string;
    parsedMerchant?: string;
    processingStatus?: string;
    direction?: string;
    parsedAmount?: number;
    parsedCurrencyCode?: string;
    senderAddress?: string;
    rawBody?: string;
    metadataJson?: string;
    inputDate?: number;
    id?: string;
  } | null;
}): SmsJournalInfoDisplay {
  const parsedMetadata = safeParseJSON<SmsMetadataFields>(
    input.inboxRecord?.metadataJson || input.metadataJson,
    {},
  );
  return {
    sender: input.inboxRecord?.senderAddress || input.originalSmsSender || undefined,
    rawBody: input.inboxRecord?.rawBody || input.originalSmsBody || undefined,
    amount:
      typeof input.inboxRecord?.parsedAmount === 'number'
        ? input.inboxRecord.parsedAmount
        : typeof parsedMetadata.parsedAmount === 'number'
          ? parsedMetadata.parsedAmount
          : undefined,
    currencyCode: input.inboxRecord?.parsedCurrencyCode || parsedMetadata.parsedCurrencyCode,
    referenceNumber: input.inboxRecord?.referenceNumber || parsedMetadata.referenceNumber,
    accountSource: input.inboxRecord?.parsedAccountSource || parsedMetadata.accountSource,
    inboxRecordId: input.inboxRecord?.id,
    merchant: input.inboxRecord?.parsedMerchant || parsedMetadata.parsedMerchant,
    autoPosted: input.inboxRecord?.processingStatus === InboxProcessingStatus.AUTO_POSTED,
    receivedAt: input.inboxRecord?.inputDate,
    amountColor:
      input.inboxRecord?.direction === TransactionDirection.CREDIT ? 'income' : 'expense',
  };
}

export function resolveRevertPlannedActionLabels(status: string): {
  actionLabel: string;
  statusLabel: string;
} {
  const isSkipped = status === 'SKIPPED';
  return {
    actionLabel: isSkipped ? 'Unskip' : 'Unpost',
    statusLabel: isSkipped ? 'skipped' : 'posted',
  };
}
