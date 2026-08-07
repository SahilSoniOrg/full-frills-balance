import { AppConfig } from '@/src/constants';
import Journal from '@/src/data/models/Journal';
import { ParsedTransaction } from '@/src/services/ledger/SmsParser';
import { normalizeSmsReferenceNumber } from '@/src/services/ledger/SmsReferenceExtractor';
import { JournalId } from '@/src/types/domain';

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

/** Reference tier wins over fuzzy — tiers are not compared by score. */
export function resolveDuplicateMatch(
  referenceDuplicate: DuplicateMatch,
  fuzzyDuplicate: DuplicateMatch,
): DuplicateMatch {
  return referenceDuplicate ?? fuzzyDuplicate;
}

export function isDuplicateAboveThreshold(duplicate: DuplicateMatch): boolean {
  return duplicate != null && duplicate.score >= DUPLICATE_CONFIG.scoreThreshold;
}
