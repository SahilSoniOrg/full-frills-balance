import { SmsMessage } from '@/modules/expo-sms-inbox';
import { database } from '@/src/data/database/Database';
import Journal from '@/src/data/models/Journal';
import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import { ledgerWriteService } from '@/src/services/ledger';
import { ParsedTransaction } from '@/src/services/ledger/SmsParser';
import { AccountId, InboxProcessingStatus, JournalId, WorkplaceId } from '@/src/types/domain';
import { safeParseJSON } from '@/src/utils/serialization';
import { normalizeSmsReferenceNumber } from '@/src/utils/sms/SmsReferenceExtractor';
import { Model } from '@nozbe/watermelondb';
import { resolveProcessingStatus, toDirection } from './smsFingerprint';
import { SmsAnalysisResult } from './types';

function getInboxCollection() {
  return database.collections.get<TransactionInboxRecord>('transaction_inbox_records');
}

export function prepareUpsertInboxRecord(
  sms: SmsMessage,
  parsed: ParsedTransaction,
  fingerprint: string,
  existingRecord: TransactionInboxRecord | null,
  processingStatus: InboxProcessingStatus,
  workplaceId: WorkplaceId,
  linkedJournalId?: JournalId,
  duplicate?: { journalId: JournalId; score: number; reasons: string[] },
): { ops: Model[]; record: TransactionInboxRecord } {
  const ops: Model[] = [];
  const now = Date.now();
  const existingMetadata = existingRecord?.metadataJson
    ? safeParseJSON<Record<string, unknown>>(existingRecord.metadataJson, {})
    : {};
  const metadataJson = JSON.stringify({
    ...existingMetadata,
    ...(duplicate ? { duplicateReasons: duplicate.reasons } : {}),
  });
  const payload = {
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

  let targetRecord: TransactionInboxRecord;
  if (existingRecord) {
    targetRecord = existingRecord;
    ops.push(
      existingRecord.prepareUpdate(record => {
        Object.assign(record, payload);
      }),
    );
  } else {
    const col = getInboxCollection();
    targetRecord = col.prepareCreate((record: TransactionInboxRecord) => {
      Object.assign(record, payload);
    });
    ops.push(targetRecord);
  }

  return { ops, record: targetRecord };
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
}): { ops: Model[]; record: TransactionInboxRecord; autoPosted: boolean } {
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

  const { ops: upsertOps, record } = prepareUpsertInboxRecord(
    result.message,
    result.parsed,
    result.fingerprint,
    latestRecord,
    finalStatus,
    workplaceId,
    linkedJournalId,
    result.duplicate || undefined,
  );
  allOps.push(...upsertOps);

  return { ops: allOps, record, autoPosted };
}
