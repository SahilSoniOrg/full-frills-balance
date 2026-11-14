import { InboxProcessingStatus, TransactionDirection } from '@/src/types/enums';
import { parseJSONRecord } from '@/src/utils/serialization';

export interface SmsJournalInfoDisplay {
  sender?: string;
  rawBody?: string;
  amount?: number;
  currencyCode?: string;
  referenceNumber?: string;
  accountSource?: string;
  inboxRecordId?: string;
  channel?: 'sms' | 'voice' | 'email';
  merchant?: string;
  autoPosted?: boolean;
  receivedAt?: number;
  amountColor?: 'income' | 'expense';
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
    channel?: 'sms' | 'voice' | 'email';
  } | null;
}): SmsJournalInfoDisplay {
  const parsedMetadata = parseJSONRecord(input.inboxRecord?.metadataJson || input.metadataJson);
  return {
    sender: input.inboxRecord?.senderAddress || input.originalSmsSender || undefined,
    rawBody: input.inboxRecord?.rawBody || input.originalSmsBody || undefined,
    amount:
      typeof input.inboxRecord?.parsedAmount === 'number'
        ? input.inboxRecord.parsedAmount
        : typeof parsedMetadata.parsedAmount === 'number'
          ? parsedMetadata.parsedAmount
          : undefined,
    currencyCode:
      input.inboxRecord?.parsedCurrencyCode ||
      (typeof parsedMetadata.parsedCurrencyCode === 'string'
        ? parsedMetadata.parsedCurrencyCode
        : undefined),
    referenceNumber:
      input.inboxRecord?.referenceNumber ||
      (typeof parsedMetadata.referenceNumber === 'string'
        ? parsedMetadata.referenceNumber
        : undefined),
    accountSource:
      input.inboxRecord?.parsedAccountSource ||
      (typeof parsedMetadata.accountSource === 'string' ? parsedMetadata.accountSource : undefined),
    inboxRecordId: input.inboxRecord?.id,
    channel: input.inboxRecord?.channel,
    merchant:
      input.inboxRecord?.parsedMerchant ||
      (typeof parsedMetadata.parsedMerchant === 'string'
        ? parsedMetadata.parsedMerchant
        : undefined),
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
