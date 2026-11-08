import { safeParseJSON } from '@/src/utils/serialization';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalQueryRepository';
import { accountQueryRepository } from '@/src/data/repositories/account';
import { JournalId, WorkplaceId } from '@/src/types/ids';
import { PlainInboxRecord } from '@/src/types/plainDtos';
import { TransactionDuplicateCandidate, TransactionInboxItem } from '@/src/types/domainJournal';
import { InboxProcessingStatus } from '@/src/types/enums';

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
  const recognizedAccounts = await accountQueryRepository.findAllByIds(workplaceId, [
    ...new Set(records.flatMap(record => record.recognition?.accountIds ?? [])),
  ]);
  const recognizedNamesById = new Map(
    recognizedAccounts.map(account => [account.id, account.name]),
  );
  const journalMap = new Map(journals.map(journal => [journal.id, journal]));

  return records.map((record): TransactionInboxItem => {
    const metadata = safeParseJSON<{
      duplicateReasons?: string[];
      captureReviewReason?: unknown;
      emailSubject?: unknown;
      gmailMessageId?: unknown;
      internetMessageId?: unknown;
    }>(record.metadataJson, {});
    const captureReviewReason =
      record.processingStatus === InboxProcessingStatus.PENDING &&
      typeof metadata.captureReviewReason === 'string'
        ? metadata.captureReviewReason.trim()
        : undefined;
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
      emailSubject: typeof metadata.emailSubject === 'string' ? metadata.emailSubject : undefined,
      gmailMessageId:
        typeof metadata.gmailMessageId === 'string' ? metadata.gmailMessageId : undefined,
      internetMessageId:
        typeof metadata.internetMessageId === 'string' ? metadata.internetMessageId : undefined,
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
      // The card explains why a parsed movement still needs review, rather than
      // repeating a successful parser diagnostic over the capture decision.
      parseReason: captureReviewReason || record.parseReason,
      recognition: record.recognition,
      recognizedAccountNames: (record.recognition?.accountIds ?? [])
        .map(accountId => recognizedNamesById.get(accountId))
        .filter((name): name is string => Boolean(name)),
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
