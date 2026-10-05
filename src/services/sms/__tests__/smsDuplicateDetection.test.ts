import { AppConfig } from '@/src/constants';
import { JournalId, WorkplaceId } from '@/src/types/ids';
import { normalizeSmsReferenceNumber } from '@/src/utils/sms/SmsReferenceExtractor';
import { smsJournalQueries } from '@/src/data/repositories/journal/SmsJournalQueries';
import {
  buildReferenceDuplicateMatch,
  coalesceActionableDuplicate,
  findManyDuplicateCandidates,
  findReferenceDuplicateMatch,
  scoreFuzzyDuplicateMatch,
} from '../smsDuplicateDetection';
import { makeParsedTx } from './smsParsedTransaction.helpers';

jest.mock('@/src/data/repositories/journal/SmsJournalQueries', () => ({
  smsJournalQueries: {
    findNearbyJournals: jest.fn().mockResolvedValue([]),
    findJournalsByReferenceNumbers: jest.fn().mockResolvedValue(new Map()),
    findJournalsByOriginalSmsIds: jest.fn().mockResolvedValue(new Map()),
    findLinkedSmsRecordsByFingerprints: jest.fn().mockResolvedValue([]),
  },
}));

describe('smsDuplicateDetection', () => {
  describe('scoreFuzzyDuplicateMatch', () => {
    const fuzzyWindowMs = AppConfig.input.sms.duplicateDetection.fuzzyWindowMs;
    const baseDate = 1700000000000;

    it('does not flag amount-only proximity across days', () => {
      const { score } = scoreFuzzyDuplicateMatch({
        journalDate: baseDate,
        messageDate: baseDate + 24 * 60 * 60 * 1000,
        journalDescription: 'Coffee Shop',
        merchant: 'Coffee Shop',
      });
      expect(score).toBeLessThan(AppConfig.input.sms.duplicateDetection.scoreThreshold);
    });

    it('flags close-in-time matches with merchant confirmation', () => {
      const { score } = scoreFuzzyDuplicateMatch({
        journalDate: baseDate,
        messageDate: baseDate + 15 * 60 * 1000,
        journalDescription: 'SWIGGY order',
        merchant: 'SWIGGY',
      });
      expect(score).toBeGreaterThanOrEqual(AppConfig.input.sms.duplicateDetection.scoreThreshold);
    });

    it('does not flag same merchant and amount when outside fuzzy window', () => {
      const { score } = scoreFuzzyDuplicateMatch({
        journalDate: baseDate,
        messageDate: baseDate + fuzzyWindowMs + 1,
        journalDescription: 'SWIGGY order',
        merchant: 'SWIGGY',
      });
      expect(score).toBeLessThan(AppConfig.input.sms.duplicateDetection.scoreThreshold);
    });
  });

  describe('findManyDuplicateCandidates', () => {
    it('queries journals using fuzzyWindowMs, not the fingerprint day bucket', async () => {
      const fuzzyWindowMs = AppConfig.input.sms.duplicateDetection.fuzzyWindowMs;
      const messageDate = 1700000000000;

      await findManyDuplicateCandidates(
        [
          {
            message: { id: 'sms-1', address: 'HDFCBK', body: 'test', date: messageDate },
            parsed: makeParsedTx({ amount: 100 }),
          },
        ],
        'wp-1' as WorkplaceId,
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

  describe('reference duplicate matching', () => {
    it('normalizes reference numbers for lookup', () => {
      expect(normalizeSmsReferenceNumber(' 121554846690 ')).toBe('121554846690');
    });

    it('builds a hard-match duplicate from reference number', () => {
      const match = buildReferenceDuplicateMatch('journal-1' as JournalId, '121554846690');
      expect(match?.score).toBe(AppConfig.input.sms.duplicateDetection.referenceMatchScore);
      expect(match?.reasons[0]).toContain('121554846690');
    });

    it('matches linked journal by reference number', () => {
      const journal = {
        id: 'journal-ref' as JournalId,
        totalAmount: 500,
      } as any;
      const match = findReferenceDuplicateMatch(
        makeParsedTx({ amount: 500, referenceNumber: '121554846690' }),
        new Map([[normalizeSmsReferenceNumber('121554846690'), journal]]),
      );

      expect(match?.journalId).toBe('journal-ref');
    });

    it('returns null when reference matches but amount differs', () => {
      const journal = {
        id: 'journal-ref' as JournalId,
        totalAmount: 500,
      } as any;
      const match = findReferenceDuplicateMatch(
        makeParsedTx({ amount: 250, referenceNumber: '121554846690' }),
        new Map([[normalizeSmsReferenceNumber('121554846690'), journal]]),
      );

      expect(match).toBeNull();
    });
  });

  describe('coalesceActionableDuplicate', () => {
    it('drops fuzzy matches below the score threshold', () => {
      const belowThreshold = {
        journalId: 'j-fuzzy' as JournalId,
        score: AppConfig.input.sms.duplicateDetection.scoreThreshold - 0.01,
        reasons: ['Close in time'],
      };

      expect(coalesceActionableDuplicate(null, belowThreshold)).toBeNull();
    });

    it('keeps reference matches regardless of fuzzy tier', () => {
      const refMatch = buildReferenceDuplicateMatch('j-ref' as JournalId, 'UTR123');
      const belowThreshold = {
        journalId: 'j-fuzzy' as JournalId,
        score: AppConfig.input.sms.duplicateDetection.scoreThreshold - 0.01,
        reasons: ['Close in time'],
      };

      expect(coalesceActionableDuplicate(refMatch, belowThreshold)).toBe(refMatch);
    });
  });
});
