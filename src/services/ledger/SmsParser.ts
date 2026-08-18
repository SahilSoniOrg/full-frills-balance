import { SmsMessage } from '@/modules/expo-sms-inbox';
import { InboxParseStatus, TransactionDirection } from '@/src/types/domain';
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
    if (isPhoneNumber) {
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

    if (info.direction === 'unknown') {
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

    if (!info.amount) {
      return {
        id: sms.id,
        merchant: info.merchantName,
        type: info.direction === 'debit' ? 'debit' : 'credit',
        date: sms.date,
        rawBody: sms.body,
        address: sms.address,
        accountSource: info.sourceAccountHint,
        referenceNumber: info.referenceNumber,
        confidence: 0.45,
        parseStatus: InboxParseStatus.PARSE_FAILED,
        parseReason: 'Could not find a supported amount',
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
      confidence: info.merchantName ? 0.92 : 0.82,
      parseStatus: InboxParseStatus.PARSED,
      parseReason: info.currencyCode
        ? 'Parsed transaction and currency hint'
        : 'Parsed transaction amount',
    };
  }
}
