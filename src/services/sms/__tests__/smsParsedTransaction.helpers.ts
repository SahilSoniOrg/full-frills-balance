import { InboxParseStatus } from '@/src/types/enums';
import { ParsedTransaction } from '@/src/services/ledger/SmsParser';

export const makeParsedTx = (overrides: Partial<ParsedTransaction>): ParsedTransaction => ({
  id: 'sms-1',
  date: Date.now(),
  rawBody: 'Test SMS Body',
  address: '12345',
  confidence: 1.0,
  parseReason: 'OK',
  type: 'debit',
  parseStatus: InboxParseStatus.PARSED,
  ...overrides,
});
