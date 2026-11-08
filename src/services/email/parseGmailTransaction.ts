import { SmsExtractor } from '@/src/services/ledger/SmsExtractor';
import { InboxParseStatus, TransactionDirection } from '@/src/types/enums';
import type { GmailObservation } from './gmailApi';
import { resolveMessageTransactionAmount } from '@/src/services/transaction-intelligence/messageAmountEvidence';

const extractor = new SmsExtractor();

/** Extracts transaction-like facts in memory. The original email body is not persisted. */
export async function parseGmailTransaction(message: GmailObservation) {
  const info = await extractor.extract({
    channel: 'email',
    id: message.id,
    rawText: message.text,
    date: message.receivedAt,
    senderAddress: message.sender,
  });
  if (info.direction === 'unknown') return null;
  const monetary = await resolveMessageTransactionAmount({ ...message, channel: 'email' }, info);
  return {
    amount: monetary.amount,
    currencyCode: monetary.currencyCode,
    amountReliableForCapture: monetary.reliable,
    merchant: info.merchantName,
    accountSource: info.sourceAccountHint,
    referenceNumber: info.referenceNumber,
    direction:
      info.direction === 'debit' ? TransactionDirection.DEBIT : TransactionDirection.CREDIT,
    parseStatus: monetary.amount ? InboxParseStatus.PARSED : InboxParseStatus.PARSE_FAILED,
  };
}
