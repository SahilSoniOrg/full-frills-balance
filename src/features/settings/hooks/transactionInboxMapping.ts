import { safeParseJSON } from '@/src/utils/serialization';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalQueryRepository';
import { JournalId, WorkplaceId } from '@/src/types/ids';
import { PlainInboxRecord } from '@/src/types/plainDtos';
import { TransactionDuplicateCandidate, TransactionInboxItem } from '@/src/types/domainJournal';

export async function enrichTransactionInboxRecords(
  workplaceId: WorkplaceId,
  records: PlainInboxRecord[],
): Promise<TransactionInboxItem[]> {
  const journalIds = new Set<JournalId>();
  for (const record of records) {
    if (record.linkedJournalId) journalIds.add(record.linkedJournalId);
    if (record.duplicateJournalId) journalIds.add(record.duplicateJournalId);
  }
  const journals = await journalQueryRepository.findWithDeletedByIds(
    workplaceId,
    Array.from(journalIds),
  );
  const journalMap = new Map(journals.map(journal => [journal.id, journal]));

  return records.map((record): TransactionInboxItem => {
    const metadata = safeParseJSON<{ duplicateReasons?: string[] }>(record.metadataJson, {});
    const duplicateJournalRecord = record.duplicateJournalId
      ? journalMap.get(record.duplicateJournalId)
      : undefined;
    const duplicateJournal = duplicateJournalRecord?.deletedAt ? undefined : duplicateJournalRecord;
    const duplicateCandidate: TransactionDuplicateCandidate | undefined =
      record.duplicateJournalId && duplicateJournal
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
    const linkedJournal = record.linkedJournalId
      ? journalMap.get(record.linkedJournalId)
      : undefined;

    return {
      id: record.id,
      consumedWorkplaces: record.consumedWorkplaces,
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
            description: linkedJournal?.description,
            journalDate: linkedJournal?.journalDate || record.inputDate,
            status: linkedJournal
              ? linkedJournal.deletedAt
                ? 'DELETED'
                : linkedJournal.status
              : 'MISSING',
            totalAmount: linkedJournal?.totalAmount,
            currencyCode: linkedJournal?.currencyCode,
            displayType: linkedJournal?.displayType,
          }
        : undefined,
      duplicateCandidate,
    };
  });
}
