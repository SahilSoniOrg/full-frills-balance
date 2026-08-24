import { SmsMessage } from '@/modules/expo-sms-inbox';
import Journal from '@/src/data/models/Journal';
import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import { TransactionInboxRecordWriteData } from '@/src/data/repositories/TransactionInboxRepository';
import { ledgerWriteService } from '@/src/services/ledger';
import { ParsedTransaction } from '@/src/services/ledger/SmsParser';
import { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';
import { InboxProcessingStatus } from '@/src/types/enums';
import { safeParseJSON } from '@/src/utils/serialization';
import { normalizeSmsReferenceNumber } from '@/src/utils/sms/SmsReferenceExtractor';
import { Model } from '@nozbe/watermelondb';
import { resolveProcessingStatus, toDirection } from './smsFingerprint';
import { SmsAnalysisResult } from './types';

export function prepareUpsertInboxRecord(
  sms: SmsMessage,
  parsed: ParsedTransaction,
  fingerprint: string,
  existingRecord: TransactionInboxRecord | null,
  processingStatus: InboxProcessingStatus,
  workplaceId: WorkplaceId,
  linkedJournalId?: JournalId,
  duplicate?: { journalId: JournalId; score: number; reasons: string[] },
): TransactionInboxRecordWriteData {
  const now = Date.now();
  const existingMetadata = existingRecord?.metadataJson
    ? safeParseJSON<Record<string, unknown>>(existingRecord.metadataJson, {})
    : {};
  const metadataJson = JSON.stringify({
    ...existingMetadata,
    ...(duplicate ? { duplicateReasons: duplicate.reasons } : {}),
  });
  return {
    workplaceId,
    channel: 'sms' as const,
    deviceSourceId: sms.id,
    senderAddress: sms.address,
    rawBody: sms.body,
    inputDate: sms.date,
    inputFingerprint: fingerprint,
    parseStatus: parsed.parseStatus,
    parsedAmount: parsed.amount,
    parsedCurrencyCode: parsed.currencyCode,
    parsedMerchant: parsed.merchant,
    parsedAccountSource: parsed.accountSource,
    referenceNumber: parsed.referenceNumber
      ? normalizeSmsReferenceNumber(parsed.referenceNumber)
      : undefined,
    direction: toDirection(parsed.type),
    processingStatus,
    linkedJournalId,
    duplicateJournalId: duplicate?.journalId,
    duplicateConfidence: duplicate?.score,
    metadataJson,
    firstSeenAt: existingRecord?.firstSeenAt ?? now,
    lastScannedAt: now,
  };
}

export function processScanBatchItem(params: {
  result: SmsAnalysisResult;
  latestRecord: TransactionInboxRecord | null;
  latestJournal: Journal | null;
  latestProcessedIds: Set<string>;
  workplaceId: WorkplaceId;
  allAccountsToRebuild: Set<AccountId>;
  processedMessageIds: string[];
  triggeredRuleIds: string[];
}): {
  journalOps: Model[];
  inboxRecord: TransactionInboxRecordWriteData;
  autoPosted: boolean;
} {
  const {
    result,
    latestRecord,
    latestJournal,
    latestProcessedIds,
    workplaceId,
    allAccountsToRebuild,
    processedMessageIds,
    triggeredRuleIds,
  } = params;

  let linkedJournalId = latestJournal?.id ?? latestRecord?.linkedJournalId;
  let finalStatus = resolveProcessingStatus({
    parsed: result.parsed,
    processedIds: latestProcessedIds,
    exactJournalId: linkedJournalId,
    duplicate: result.duplicate,
    existingStatus: latestRecord?.processingStatus,
  });

  if (
    result.finalStatus === InboxProcessingStatus.DISMISSED &&
    finalStatus === InboxProcessingStatus.PENDING
  ) {
    finalStatus = InboxProcessingStatus.DISMISSED;
  }

  const allOps: Model[] = [];
  let autoPosted = false;

  if (result.autoPost && !linkedJournalId && finalStatus === InboxProcessingStatus.PENDING) {
    const { journal, ops, accountsToRebuild } =
      ledgerWriteService.prepareCreateJournalFromPreparedData(
        result.autoPost.journalData,
        result.autoPost.preparedJournal,
        workplaceId,
      );

    allOps.push(...ops);
    accountsToRebuild.forEach(id => allAccountsToRebuild.add(id));
    linkedJournalId = journal.id;
    finalStatus = InboxProcessingStatus.AUTO_POSTED;
    autoPosted = true;
    processedMessageIds.push(result.message.id);
    triggeredRuleIds.push(result.autoPost.ruleId);
  }

  const inboxRecord = prepareUpsertInboxRecord(
    result.message,
    result.parsed,
    result.fingerprint,
    latestRecord,
    finalStatus,
    workplaceId,
    linkedJournalId,
    result.duplicate || undefined,
  );
  return { journalOps: allOps, inboxRecord, autoPosted };
}
