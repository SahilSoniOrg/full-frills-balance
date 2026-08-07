import { SmsSyncPipeline } from '../SmsSyncPipeline';
import {
  InboxParseStatus,
  InboxProcessingStatus,
  TransactionDirection,
} from '@/src/data/models/TransactionInboxRecord';
import { AppConfig } from '@/src/constants';
import { ParsedTransaction } from '@/src/services/ledger/SmsParser';
import { JournalId } from '@/src/types/domain';
import { smsJournalQueries } from '@/src/data/repositories/journal/SmsJournalQueries';

jest.mock('@/src/data/repositories/journal/SmsJournalQueries', () => ({
  smsJournalQueries: {
    findNearbyJournals: jest.fn().mockResolvedValue([]),
  },
}));

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
    jest.clearAllMocks();
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

    it('buckets fingerprints by fingerprintDayBucketMs config', () => {
      const dayMs = AppConfig.input.sms.duplicateDetection.fingerprintDayBucketMs;
      const baseDate = Math.floor(1700000000000 / dayMs) * dayMs;
      const fpSameBucket = pipeline.computeSmsFingerprint('HDFCBK', 'test body', baseDate);
      const fpStillSameBucket = pipeline.computeSmsFingerprint(
        'HDFCBK',
        'test body',
        baseDate + 60 * 60 * 1000,
      );
      const fpNextBucket = pipeline.computeSmsFingerprint('HDFCBK', 'test body', baseDate + dayMs);

      expect(fpSameBucket).toBe(fpStillSameBucket);
      expect(fpSameBucket).not.toBe(fpNextBucket);
    });
  });

  describe('duplicate detection config', () => {
    it('exposes separate fingerprint and fuzzy window durations', () => {
      const { fingerprintDayBucketMs, fuzzyWindowMs } = AppConfig.input.sms.duplicateDetection;
      expect(fingerprintDayBucketMs).toBe(24 * 60 * 60 * 1000);
      expect(fuzzyWindowMs).toBe(4 * 60 * 60 * 1000);
      expect(fingerprintDayBucketMs).toBeGreaterThan(fuzzyWindowMs);
    });
  });

  describe('findManyDuplicateCandidates', () => {
    it('queries journals using fuzzyWindowMs, not the fingerprint day bucket', async () => {
      const fuzzyWindowMs = AppConfig.input.sms.duplicateDetection.fuzzyWindowMs;
      const messageDate = 1700000000000;

      await (pipeline as any).findManyDuplicateCandidates(
        [
          {
            message: { id: 'sms-1', address: 'HDFCBK', body: 'test', date: messageDate },
            parsed: makeParsedTx({ amount: 100 }),
          },
        ],
        'wp-1',
      );

      expect(smsJournalQueries.findNearbyJournals).toHaveBeenCalledWith(
        expect.objectContaining({
          centerDate: messageDate,
          windowMs: fuzzyWindowMs,
        }),
        'wp-1',
      );
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

    it('returns DUPLICATE_FLAGGED when score meets threshold', () => {
      const status = pipeline.resolveProcessingStatus({
        parsed: makeParsedTx({ parseStatus: InboxParseStatus.PARSED, type: 'debit', amount: 50 }),
        processedIds: new Set(),
        duplicate: {
          journalId: 'j1' as JournalId,
          score: AppConfig.input.sms.duplicateDetection.scoreThreshold,
          reasons: ['Same amount', 'Close in time'],
        },
      });
      expect(status).toBe(InboxProcessingStatus.DUPLICATE_FLAGGED);
    });

    it('returns PENDING when duplicate score is below threshold', () => {
      const status = pipeline.resolveProcessingStatus({
        parsed: makeParsedTx({ parseStatus: InboxParseStatus.PARSED, type: 'debit', amount: 50 }),
        processedIds: new Set(),
        duplicate: {
          journalId: 'j1' as JournalId,
          score: AppConfig.input.sms.duplicateDetection.scoreThreshold - 0.01,
          reasons: ['Same amount'],
        },
      });
      expect(status).toBe(InboxProcessingStatus.PENDING);
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

  describe('prepareUpsertInboxRecord', () => {
    const sms = {
      id: 'sms-42',
      address: 'HDFCBK',
      body: 'Debited INR 500 at SWIGGY',
      date: 1700000000000,
    };

    it('persists duplicate metadata on the inbox model fields', () => {
      let createdRecord: Record<string, unknown> = {};
      const mockInbox = {
        prepareCreate: jest.fn((fn: (record: Record<string, unknown>) => void) => {
          fn(createdRecord);
          return createdRecord;
        }),
      };

      jest.spyOn(pipeline as any, 'inbox', 'get').mockReturnValue(mockInbox);

      const { record } = pipeline.prepareUpsertInboxRecord(
        sms,
        makeParsedTx({ amount: 500, merchant: 'SWIGGY' }),
        'fingerprint-abc',
        null,
        InboxProcessingStatus.DUPLICATE_FLAGGED,
        'wp-1' as any,
        undefined,
        {
          journalId: 'journal-dup' as JournalId,
          score: 0.72,
          reasons: ['Same amount', 'Matching description/merchant'],
        },
      );

      expect(record).toBe(createdRecord);
      expect(createdRecord.inputFingerprint).toBe('fingerprint-abc');
      expect(createdRecord.duplicateJournalId).toBe('journal-dup');
      expect(createdRecord.duplicateConfidence).toBe(0.72);
      expect(createdRecord.firstSeenAt).toEqual(expect.any(Number));
      expect(createdRecord.lastScannedAt).toEqual(expect.any(Number));

      const metadata = JSON.parse(createdRecord.metadataJson as string);
      expect(metadata.duplicateReasons).toEqual(['Same amount', 'Matching description/merchant']);
    });

    it('persists referenceNumber from parsed SMS', () => {
      let createdRecord: Record<string, unknown> = {};
      const mockInbox = {
        prepareCreate: jest.fn((fn: (record: Record<string, unknown>) => void) => {
          fn(createdRecord);
          return createdRecord;
        }),
      };

      jest.spyOn(pipeline as any, 'inbox', 'get').mockReturnValue(mockInbox);

      pipeline.prepareUpsertInboxRecord(
        sms,
        makeParsedTx({ amount: 500, referenceNumber: 'UTR123456' }),
        'fingerprint-abc',
        null,
        InboxProcessingStatus.PENDING,
        'wp-1' as any,
      );

      expect(createdRecord.referenceNumber).toBe('UTR123456');
    });

    it('preserves firstSeenAt and merges metadata when updating an existing record', () => {
      let updatedRecord: Record<string, unknown> = {};
      const existingRecord = {
        firstSeenAt: 1699000000000,
        metadataJson: JSON.stringify({ keepMe: true }),
        prepareUpdate: jest.fn((fn: (record: Record<string, unknown>) => void) => {
          updatedRecord = {
            firstSeenAt: 1699000000000,
            metadataJson: JSON.stringify({ keepMe: true }),
          };
          fn(updatedRecord);
          return updatedRecord;
        }),
      };

      pipeline.prepareUpsertInboxRecord(
        sms,
        makeParsedTx({ amount: 500 }),
        'fingerprint-abc',
        existingRecord as any,
        InboxProcessingStatus.PENDING,
        'wp-1' as any,
      );

      expect(updatedRecord.firstSeenAt).toBe(1699000000000);
      expect(updatedRecord.lastScannedAt).toEqual(expect.any(Number));
      const metadata = JSON.parse(updatedRecord.metadataJson as string);
      expect(metadata.keepMe).toBe(true);
    });
  });
});
