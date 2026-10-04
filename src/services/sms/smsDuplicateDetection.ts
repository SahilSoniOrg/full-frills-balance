import { SmsMessage } from '@/modules/expo-sms-inbox';
import { AppConfig } from '@/src/constants';
import Journal from '@/src/data/models/Journal';
import { smsJournalQueries } from '@/src/data/repositories/journal/SmsJournalQueries';
import { ParsedTransaction } from '@/src/services/ledger/SmsParser';
import { normalizeSmsReferenceNumber } from '@/src/utils/sms/SmsReferenceExtractor';
import { JournalId, WorkplaceId } from '@/src/types/ids';

const DUPLICATE_CONFIG = AppConfig.input.sms.duplicateDetection;

export type DuplicateMatch = {
  journalId: JournalId;
  score: number;
  reasons: string[];
} | null;

export function scoreFuzzyDuplicateMatch(params: {
  journalDate: number;
  messageDate: number;
  journalDescription?: string | null;
  merchant?: string;
}): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  const timeDistance = Math.abs(params.journalDate - params.messageDate);
  const timeScore = Math.max(
    0,
    DUPLICATE_CONFIG.weightTime -
      (timeDistance / DUPLICATE_CONFIG.fuzzyWindowMs) * DUPLICATE_CONFIG.weightTime,
  );
  score += timeScore;
  if (timeScore > DUPLICATE_CONFIG.weightTime / 2) {
    reasons.push('Close in time');
  }

  if (
    params.merchant &&
    params.journalDescription &&
    params.journalDescription.toLowerCase().includes(params.merchant.toLowerCase())
  ) {
    score += DUPLICATE_CONFIG.weightMerchant;
    reasons.push('Matching description/merchant');
  }

  return { score, reasons };
}

export function buildReferenceDuplicateMatch(
  journalId: JournalId,
  referenceNumber: string,
): DuplicateMatch {
  return {
    journalId,
    score: DUPLICATE_CONFIG.referenceMatchScore,
    reasons: [`Matching reference number (${referenceNumber})`],
  };
}

export function findReferenceDuplicateMatch(
  parsed: ParsedTransaction,
  journalsByReference: Map<string, Journal>,
): DuplicateMatch {
  if (!parsed.referenceNumber) {
    return null;
  }

  const journal = journalsByReference.get(normalizeSmsReferenceNumber(parsed.referenceNumber));
  if (!journal) {
    return null;
  }

  if (parsed.amount != null && journal.totalAmount !== parsed.amount) {
    return null;
  }

  return buildReferenceDuplicateMatch(journal.id, parsed.referenceNumber);
}

export function isDuplicateAboveThreshold(duplicate: DuplicateMatch): boolean {
  return duplicate != null && duplicate.score >= DUPLICATE_CONFIG.scoreThreshold;
}

/** Resolve tiers and drop matches below the fuzzy score threshold. */
export function coalesceActionableDuplicate(
  referenceDuplicate: DuplicateMatch,
  fuzzyDuplicate: DuplicateMatch,
): DuplicateMatch {
  const match = referenceDuplicate ?? fuzzyDuplicate;
  return isDuplicateAboveThreshold(match) ? match : null;
}

export async function findManyDuplicateCandidates(
  parsedItems: { message: SmsMessage; parsed: ParsedTransaction }[],
  workplaceId: WorkplaceId,
): Promise<Map<string, DuplicateMatch>> {
  if (parsedItems.length === 0) return new Map();

  const results = new Map<string, DuplicateMatch>();
  const amounts = Array.from(new Set(parsedItems.map(p => p.parsed.amount!)));
  const minDate =
    Math.min(...parsedItems.map(p => p.message.date)) - DUPLICATE_CONFIG.fuzzyWindowMs;
  const maxDate =
    Math.max(...parsedItems.map(p => p.message.date)) + DUPLICATE_CONFIG.fuzzyWindowMs;

  const journals = await smsJournalQueries.findNearbyJournals(
    {
      centerDate: (minDate + maxDate) / 2,
      windowMs: (maxDate - minDate) / 2,
      amounts,
      limit: 100,
    },
    workplaceId,
  );

  if (journals.length === 0) return results;

  for (const { message, parsed } of parsedItems) {
    const nearby = journals.filter(
      j =>
        Math.abs(j.journalDate - message.date) <= DUPLICATE_CONFIG.fuzzyWindowMs &&
        j.totalAmount === parsed.amount,
    );

    if (nearby.length === 0) continue;

    let best: DuplicateMatch = null;
    for (const journal of nearby) {
      const { score, reasons } = scoreFuzzyDuplicateMatch({
        journalDate: journal.journalDate,
        messageDate: message.date,
        journalDescription: journal.description,
        merchant: parsed.merchant,
      });

      if (!best || score > best.score) {
        best = { journalId: journal.id, score, reasons };
      }
    }

    if (best && isDuplicateAboveThreshold(best)) {
      results.set(message.id, best);
    }
  }

  return results;
}
