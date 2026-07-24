import { SmsSyncPipeline } from '../SmsSyncPipeline';
import {
  InboxParseStatus,
  InboxProcessingStatus,
  TransactionDirection,
} from '@/src/data/models/TransactionInboxRecord';
import { ParsedTransaction } from '@/src/services/ledger/SmsParser';
import { JournalId } from '@/src/types/domain';

const makeParsedTx = (overrides: Partial<ParsedTransaction>): ParsedTransaction => ({
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

describe('SmsSyncPipeline', () => {
  let pipeline: SmsSyncPipeline;

  beforeEach(() => {
    pipeline = new SmsSyncPipeline();
  });

  describe('computeSmsFingerprint', () => {
    it('normalizes sender, body, and dates into consistent fingerprint strings', () => {
      const fp1 = pipeline.computeSmsFingerprint(
        ' +1 (800) 555-0199 ',
        'Spent $25.00 at Starbucks Coffee!',
        1700000000000,
      );
      const fp2 = pipeline.computeSmsFingerprint(
        '18005550199',
        'spent $2500 at starbucks coffee',
        1700000000000,
      );

      expect(fp1).toEqual(fp2);
      expect(fp1).toContain('18005550199');
      expect(fp1).toContain('spent 2500 at starbucks coffee');
    });
  });

  describe('toDirection', () => {
    it('maps transaction string directions to domain enum', () => {
      expect(pipeline.toDirection('debit')).toBe(TransactionDirection.DEBIT);
      expect(pipeline.toDirection('credit')).toBe(TransactionDirection.CREDIT);
      expect(pipeline.toDirection('unknown')).toBe(TransactionDirection.UNKNOWN);
    });
  });

  describe('resolveProcessingStatus', () => {
    it('returns PARSE_FAILED when parsing failed', () => {
      const status = pipeline.resolveProcessingStatus({
        parsed: makeParsedTx({ parseStatus: InboxParseStatus.PARSE_FAILED, type: 'unknown' }),
        processedIds: new Set(),
        duplicate: null,
      });
      expect(status).toBe(InboxProcessingStatus.PARSE_FAILED);
    });

    it('returns DISMISSED when parseStatus is IGNORED', () => {
      const status = pipeline.resolveProcessingStatus({
        parsed: makeParsedTx({ parseStatus: InboxParseStatus.IGNORED, type: 'unknown' }),
        processedIds: new Set(),
        duplicate: null,
      });
      expect(status).toBe(InboxProcessingStatus.DISMISSED);
    });

    it('returns IMPORTED when exactJournalId is provided', () => {
      const status = pipeline.resolveProcessingStatus({
        parsed: makeParsedTx({ parseStatus: InboxParseStatus.PARSED, type: 'debit', amount: 50 }),
        processedIds: new Set(),
        exactJournalId: 'journal-123',
        duplicate: null,
      });
      expect(status).toBe(InboxProcessingStatus.IMPORTED);
    });

    it('returns DUPLICATE_FLAGGED when score exceeds threshold', () => {
      const status = pipeline.resolveProcessingStatus({
        parsed: makeParsedTx({ parseStatus: InboxParseStatus.PARSED, type: 'debit', amount: 50 }),
        processedIds: new Set(),
        duplicate: {
          journalId: 'j1' as JournalId,
          score: 85,
          reasons: ['Same amount', 'Close in time'],
        },
      });
      expect(status).toBe(InboxProcessingStatus.DUPLICATE_FLAGGED);
    });

    it('returns PENDING for clean unprocessed messages', () => {
      const status = pipeline.resolveProcessingStatus({
        parsed: makeParsedTx({ parseStatus: InboxParseStatus.PARSED, type: 'debit', amount: 50 }),
        processedIds: new Set(),
        duplicate: null,
      });
      expect(status).toBe(InboxProcessingStatus.PENDING);
    });
  });
});
