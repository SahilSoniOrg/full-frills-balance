import { SmsMessage } from '@/modules/expo-sms-inbox';
import { AppConfig } from '@/src/constants';
import { smsJournalQueries } from '@/src/data/repositories/journal/journalSmsModule';
import { ParsedTransaction } from '@/src/services/ledger/SmsParser';
import {
  DuplicateMatch,
  isDuplicateAboveThreshold,
  scoreFuzzyDuplicateMatch,
} from '@/src/services/sms/smsDuplicateDetection';
import { WorkplaceId } from '@/src/types/domain';

const SMS_CONFIG = AppConfig.input.sms;
const DUPLICATE_CONFIG = SMS_CONFIG.duplicateDetection;

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
