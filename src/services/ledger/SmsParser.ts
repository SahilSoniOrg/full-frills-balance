import { SmsMessage } from '@/modules/expo-sms-inbox';
import { InboxParseStatus, TransactionDirection } from '@/src/types/enums';
import { SmsExtractor } from '@/src/services/ledger/SmsExtractor';

export function toTransactionDirection(type: 'debit' | 'credit' | 'unknown'): TransactionDirection {
  if (type === 'debit') return TransactionDirection.DEBIT;
  if (type === 'credit') return TransactionDirection.CREDIT;
  return TransactionDirection.UNKNOWN;
}

export interface ParsedTransaction {
  id: string;
  amount?: number;
  merchant?: string;
  type: 'debit' | 'credit' | 'unknown';
  date: number;
  rawBody: string;
  address: string;
  accountSource?: string;
  referenceNumber?: string;
  currencyCode?: string;
  confidence: number;
  parseStatus: InboxParseStatus;
  parseReason: string;
}

const smsExtractor = new SmsExtractor();

export class SmsParser {
  static async parse(sms: SmsMessage): Promise<ParsedTransaction> {
    const info = await smsExtractor.extract({
      channel: 'sms',
      id: sms.id,
      rawText: sms.body,
      date: sms.date,
      senderAddress: sms.address,
    });

    const isPhoneNumber = /^\+?\d{10,14}$/.test(sms.address);
    if (isPhoneNumber && info.direction === 'unknown' && !info.isTransactionLike) {
      return {
        id: sms.id,
        type: 'unknown',
        date: sms.date,
        rawBody: sms.body,
        address: sms.address,
        confidence: 0,
        parseStatus: InboxParseStatus.IGNORED,
        parseReason: 'Personal sender address',
      };
    }

    if (info.direction === 'unknown' && !info.isTransactionLike) {
      return {
        id: sms.id,
        type: 'unknown',
        date: sms.date,
        rawBody: sms.body,
        address: sms.address,
        accountSource: info.sourceAccountHint,
        referenceNumber: info.referenceNumber,
        confidence: 0.2,
        parseStatus: InboxParseStatus.IGNORED,
        parseReason: 'Not classified as transaction-like',
      };
    }

    if (info.direction === 'unknown' || info.amount == null) {
      return {
        id: sms.id,
        merchant: info.merchantName,
        type: info.direction,
        date: sms.date,
        rawBody: sms.body,
        address: sms.address,
        accountSource: info.sourceAccountHint,
        referenceNumber: info.referenceNumber,
        confidence: info.parseConfidence ?? 0.3,
        parseStatus: InboxParseStatus.PARSE_FAILED,
        parseReason:
          info.direction === 'unknown'
            ? 'Could not determine transaction direction; review this message'
            : 'Could not find a supported transaction amount; review this message',
      };
    }

    return {
      id: sms.id,
      amount: info.amount,
      merchant: info.merchantName,
      type: info.direction === 'debit' ? 'debit' : 'credit',
      date: sms.date,
      rawBody: sms.body,
      address: sms.address,
      accountSource: info.sourceAccountHint,
      referenceNumber: info.referenceNumber,
      currencyCode: info.currencyCode,
      confidence: info.parseConfidence ?? (info.merchantName ? 0.82 : 0.72),
      parseStatus: InboxParseStatus.PARSED,
      parseReason:
        info.parseReason ||
        (info.currencyCode
          ? 'Parsed transaction and currency'
          : 'Parsed transaction amount; currency needs review'),
    };
  }
}
