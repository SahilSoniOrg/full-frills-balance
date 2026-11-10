import { transactionInboxRepository } from '@/src/data/repositories/TransactionInboxRepository';
import { journalHistoricalCaptureQueries } from '@/src/data/repositories/journal/JournalHistoricalCaptureQueries';
import { AppConfig } from '@/src/constants/app-config';
import type { HistoricalSmsMerchantRepair } from '@/src/domain/transaction-intelligence/historicalSmsEvidence';
import { SmsExtractor } from '@/src/services/ledger/SmsExtractor';
import { preferences } from '@/src/services/preferences';
import type { WorkplaceId } from '@/src/types/ids';

const PAGE_SIZE = 100;

/** Repairs only linked SMS merchants that the old parser cut at the first VPA dot. */
export async function repairLegacyUpiMerchants(workplaceId: WorkplaceId): Promise<number> {
  const repairVersion = AppConfig.migrations.historicalSmsMerchantRepair;
  if (
    preferences.workplace.getSnapshot(workplaceId).historicalSmsMerchantRepairVersion ===
    repairVersion
  )
    return 0;

  const extractor = new SmsExtractor();
  let cursor: string | undefined;
  let inboxUpdatedCount = 0;
  let evidenceUpdatedCount = 0;

  while (true) {
    const records = await transactionInboxRepository.findLinkedProcessedSmsPage(
      workplaceId,
      cursor,
      PAGE_SIZE,
    );
    if (!records.length) break;

    const inboxRepairs = [];
    const evidenceRepairs = new Map<string, HistoricalSmsMerchantRepair>();
    for (const record of records) {
      if (!record.rawBody || !record.parsedMerchant) continue;
      const parsed = await extractor.extract({
        channel: 'sms',
        id: record.deviceSourceId,
        date: record.inputDate,
        rawText: record.rawBody,
        senderAddress: record.senderAddress,
      });
      const correctedMerchant = parsed.merchantName?.trim();
      if (!correctedMerchant?.includes('@')) continue;
      const firstDot = correctedMerchant.indexOf('.');
      if (firstDot <= 0) continue;
      const previousMerchant = record.parsedMerchant.trim();
      const truncatedMerchant = correctedMerchant.slice(0, firstDot);
      const matchesTruncated = previousMerchant.toLowerCase() === truncatedMerchant.toLowerCase();
      const matchesCorrected = previousMerchant.toLowerCase() === correctedMerchant.toLowerCase();
      if (!matchesTruncated && !matchesCorrected) continue;

      evidenceRepairs.set(record.deviceSourceId, {
        sourceId: record.deviceSourceId,
        previousMerchant: truncatedMerchant,
        correctedMerchant,
      });
      if (!matchesTruncated) continue;
      inboxRepairs.push({
        recordId: record.id,
        previousMerchant: record.parsedMerchant,
        correctedMerchant,
      });
    }

    inboxUpdatedCount += await transactionInboxRepository.repairParsedSmsMerchants(
      workplaceId,
      inboxRepairs,
    );
    evidenceUpdatedCount += await journalHistoricalCaptureQueries.repairSmsEvidenceMerchants(
      workplaceId,
      [...evidenceRepairs.values()],
    );
    cursor = records[records.length - 1].id;
    if (records.length < PAGE_SIZE) break;
  }

  preferences.workplace.update(workplaceId, {
    historicalSmsMerchantRepairVersion: repairVersion,
  });
  return Math.max(inboxUpdatedCount, evidenceUpdatedCount);
}
