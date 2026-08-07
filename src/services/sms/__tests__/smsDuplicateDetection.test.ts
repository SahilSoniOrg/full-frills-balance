import { AppConfig } from '@/src/constants';
import { InboxParseStatus, InboxProcessingStatus } from '@/src/data/models/TransactionInboxRecord';
import { ParsedTransaction } from '@/src/services/ledger/SmsParser';
import { normalizeSmsReferenceNumber } from '@/src/services/ledger/SmsReferenceExtractor';
import { JournalId } from '@/src/types/domain';
import {
  buildReferenceDuplicateMatch,
  coalesceActionableDuplicate,
  findReferenceDuplicateMatch,
  resolveDuplicateMatch,
  scoreFuzzyDuplicateMatch,
} from '../smsDuplicateDetection';
import { SmsSyncPipeline } from '../SmsSyncPipeline';

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

  describe('reference duplicate matching', () => {
    it('normalizes reference numbers for lookup', () => {
      expect(normalizeSmsReferenceNumber(' 121554846690 ')).toBe('121554846690');
    });

    it('builds a hard-match duplicate from reference number', () => {
      const match = buildReferenceDuplicateMatch('journal-1' as JournalId, '121554846690');
      expect(match?.score).toBe(AppConfig.input.sms.duplicateDetection.referenceMatchScore);
      expect(match?.reasons[0]).toContain('121554846690');
    });

    it('flags DUPLICATE when reference matches linked journal', () => {
      const pipeline = new SmsSyncPipeline();
      const journal = {
        id: 'journal-ref' as JournalId,
        totalAmount: 500,
      } as any;
      const match = findReferenceDuplicateMatch(
        makeParsedTx({ amount: 500, referenceNumber: '121554846690' }),
        new Map([[normalizeSmsReferenceNumber('121554846690'), journal]]),
      );

      expect(match?.journalId).toBe('journal-ref');
      expect(
        pipeline.resolveProcessingStatus({
          parsed: makeParsedTx({
            amount: 500,
            referenceNumber: '121554846690',
          }),
          processedIds: new Set(),
          duplicate: match,
        }),
      ).toBe(InboxProcessingStatus.DUPLICATE_FLAGGED);
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

  describe('resolveDuplicateMatch', () => {
    const refMatch = buildReferenceDuplicateMatch('j-ref' as JournalId, 'UTR123');
    const fuzzyMatch = {
      journalId: 'j-fuzzy' as JournalId,
      score: 0.9,
      reasons: ['Close in time'],
    };

    it('prefers reference tier even when fuzzy score is higher', () => {
      expect(resolveDuplicateMatch(refMatch, fuzzyMatch)).toBe(refMatch);
    });

    it('falls back to fuzzy when reference tier has no match', () => {
      expect(resolveDuplicateMatch(null, fuzzyMatch)).toBe(fuzzyMatch);
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
