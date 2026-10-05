import { AppConfig } from '@/src/constants';
import { InboxParseStatus, InboxProcessingStatus } from '@/src/types/enums';
import { JournalId } from '@/src/types/ids';
import { computeSmsFingerprint, resolveProcessingStatus } from '../smsFingerprint';
import { makeParsedTx } from '../../__tests__/smsParsedTransaction.helpers';

describe('smsFingerprint', () => {
  describe('computeSmsFingerprint', () => {
    it('normalizes sender, body, and dates into consistent fingerprint strings', () => {
      const fp1 = computeSmsFingerprint(
        ' +1 (800) 555-0199 ',
        'Spent $25.00 at Starbucks Coffee!',
        1700000000000,
      );
      const fp2 = computeSmsFingerprint(
        '18005550199',
        'spent $2500 at starbucks coffee',
        1700000000000,
      );

      expect(fp1).toEqual(fp2);
      expect(fp1).toMatch(/^sha256:[a-f\d]{64}$/i);
      expect(fp1).not.toContain('18005550199');
      expect(fp1).not.toContain('spent 2500 at starbucks coffee');
    });

    it('buckets fingerprints by fingerprintDayBucketMs config', () => {
      const dayMs = AppConfig.input.sms.duplicateDetection.fingerprintDayBucketMs;
      const baseDate = Math.floor(1700000000000 / dayMs) * dayMs;
      const fpSameBucket = computeSmsFingerprint('HDFCBK', 'test body', baseDate);
      const fpStillSameBucket = computeSmsFingerprint(
        'HDFCBK',
        'test body',
        baseDate + 60 * 60 * 1000,
      );
      const fpNextBucket = computeSmsFingerprint('HDFCBK', 'test body', baseDate + dayMs);

      expect(fpSameBucket).toBe(fpStillSameBucket);
      expect(fpSameBucket).not.toBe(fpNextBucket);
    });
  });

  describe('resolveProcessingStatus', () => {
    it.each([
      [
        InboxProcessingStatus.PARSE_FAILED,
        makeParsedTx({ parseStatus: InboxParseStatus.PARSE_FAILED, type: 'unknown' }),
        {},
      ],
      [
        InboxProcessingStatus.DISMISSED,
        makeParsedTx({ parseStatus: InboxParseStatus.IGNORED, type: 'unknown' }),
        {},
      ],
      [
        InboxProcessingStatus.IMPORTED,
        makeParsedTx({ parseStatus: InboxParseStatus.PARSED, type: 'debit', amount: 50 }),
        { exactJournalId: 'journal-123' },
      ],
      [
        InboxProcessingStatus.PENDING,
        makeParsedTx({ parseStatus: InboxParseStatus.PARSED, type: 'debit', amount: 50 }),
        {},
      ],
    ] as const)('returns %s for the base inputs', (expected, parsed, extras) => {
      expect(
        resolveProcessingStatus({
          parsed,
          processedIds: new Set(),
          duplicate: null,
          ...extras,
        }),
      ).toBe(expected);
    });

    it('returns DUPLICATE_FLAGGED when score meets threshold', () => {
      expect(
        resolveProcessingStatus({
          parsed: makeParsedTx({ parseStatus: InboxParseStatus.PARSED, type: 'debit', amount: 50 }),
          processedIds: new Set(),
          duplicate: {
            journalId: 'j1' as JournalId,
            score: AppConfig.input.sms.duplicateDetection.scoreThreshold,
            reasons: ['Close in time', 'Matching description/merchant'],
          },
        }),
      ).toBe(InboxProcessingStatus.DUPLICATE_FLAGGED);
    });

    it('upgrades PENDING to DUPLICATE_FLAGGED on re-scan when duplicate is found', () => {
      expect(
        resolveProcessingStatus({
          parsed: makeParsedTx({ parseStatus: InboxParseStatus.PARSED, type: 'debit', amount: 50 }),
          processedIds: new Set(),
          existingStatus: InboxProcessingStatus.PENDING,
          duplicate: {
            journalId: 'j1' as JournalId,
            score: AppConfig.input.sms.duplicateDetection.scoreThreshold,
            reasons: ['Matching reference number (UTR123)'],
          },
        }),
      ).toBe(InboxProcessingStatus.DUPLICATE_FLAGGED);
    });

    it('upgrades PENDING to IMPORTED when the final write recheck finds a journal', () => {
      expect(
        resolveProcessingStatus({
          parsed: makeParsedTx({ parseStatus: InboxParseStatus.PARSED, type: 'debit', amount: 50 }),
          processedIds: new Set(),
          exactJournalId: 'journal-created-by-racing-scan',
          existingStatus: InboxProcessingStatus.PENDING,
          duplicate: null,
        }),
      ).toBe(InboxProcessingStatus.IMPORTED);
    });

    it('preserves IMPORTED status on re-scan even when duplicate is found', () => {
      expect(
        resolveProcessingStatus({
          parsed: makeParsedTx({ parseStatus: InboxParseStatus.PARSED, type: 'debit', amount: 50 }),
          processedIds: new Set(),
          existingStatus: InboxProcessingStatus.IMPORTED,
          duplicate: {
            journalId: 'j1' as JournalId,
            score: AppConfig.input.sms.duplicateDetection.scoreThreshold,
            reasons: ['Matching reference number (UTR123)'],
          },
        }),
      ).toBe(InboxProcessingStatus.IMPORTED);
    });
  });
});
