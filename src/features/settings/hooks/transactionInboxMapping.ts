import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalTimelineModule';
import {
  JournalId,
  TransactionDuplicateCandidate,
  TransactionInboxItem,
  WorkplaceId,
} from '@/src/types/domain';

/** Maps inbox DB records to list items, joining linked/duplicate journals. */
export async function enrichTransactionInboxRecords(
  workplaceId: WorkplaceId,
  records: TransactionInboxRecord[],
): Promise<TransactionInboxItem[]> {
  const linkedIds = Array.from(
    new Set(records.map(record => record.linkedJournalId).filter(Boolean) as JournalId[]),
  );
  const duplicateIds = Array.from(
    new Set(records.map(record => record.duplicateJournalId).filter(Boolean) as JournalId[]),
  );
  const journals = await journalQueryRepository.findByIds(
    workplaceId,
    Array.from(new Set([...linkedIds, ...duplicateIds])),
  );
  const journalMap = new Map(journals.map(journal => [journal.id, journal]));

  return records.map((record): TransactionInboxItem => {
    const metadata = record.metadataJson ? JSON.parse(record.metadataJson) : {};
    const duplicateJournal = record.duplicateJournalId
      ? journalMap.get(record.duplicateJournalId)
      : undefined;
    const duplicateCandidate: TransactionDuplicateCandidate | undefined = record.duplicateJournalId
      ? {
          journalId: record.duplicateJournalId,
          journalDate: duplicateJournal?.journalDate || record.inputDate,
          description: duplicateJournal?.description,
          totalAmount: duplicateJournal?.totalAmount,
          currencyCode: duplicateJournal?.currencyCode,
          score: record.duplicateConfidence || 0,
          reasons: Array.isArray(metadata.duplicateReasons) ? metadata.duplicateReasons : [],
        }
      : undefined;

    return {
      id: record.id,
      channel: record.channel,
      deviceSourceId: record.deviceSourceId,
      senderAddress: record.senderAddress || '',
      rawBody: record.rawBody || '',
      inputDate: record.inputDate,
      parseStatus: record.parseStatus,
      processingStatus: record.processingStatus,
      parsedAmount: record.parsedAmount,
      parsedCurrencyCode: record.parsedCurrencyCode,
      parsedMerchant: record.parsedMerchant,
      parsedAccountSource: record.parsedAccountSource,
      referenceNumber: record.referenceNumber,
      direction: record.direction,
      parseConfidence: record.parseConfidence,
      parseReason: record.parseReason,
      linkedJournal: record.linkedJournalId
        ? {
            journalId: record.linkedJournalId,
            description: journalMap.get(record.linkedJournalId)?.description,
            journalDate: journalMap.get(record.linkedJournalId)?.journalDate || record.inputDate,
            status: journalMap.get(record.linkedJournalId)?.status || 'POSTED',
          }
        : undefined,
      duplicateCandidate,
    };
  });
}
