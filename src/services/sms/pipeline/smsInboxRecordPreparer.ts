import { SmsMessage } from '@/modules/expo-sms-inbox';
import Journal from '@/src/data/models/Journal';
import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import { TransactionInboxRecordWriteData } from '@/src/data/repositories/TransactionInboxRepository';
import type { AccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import type { JournalPersistenceResult } from '@/src/data/repositories/journal/JournalPersistenceRepository';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import { ParsedTransaction, toTransactionDirection } from '@/src/services/ledger/SmsParser';
import { JournalId, WorkplaceId } from '@/src/types/ids';
import { InboxProcessingStatus } from '@/src/types/enums';
import { safeParseJSON } from '@/src/utils/serialization';
import { normalizeSmsReferenceNumber } from '@/src/utils/sms/SmsReferenceExtractor';
import { logger } from '@/src/utils/logger';
import { resolveProcessingStatus } from './smsFingerprint';
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
    direction: toTransactionDirection(parsed.type),
    processingStatus,
    linkedJournalId,
    duplicateJournalId: duplicate?.journalId,
    duplicateConfidence: duplicate?.score,
    metadataJson,
    firstSeenAt: existingRecord?.firstSeenAt ?? now,
    lastScannedAt: now,
  };
}

export async function processScanBatchItem(params: {
  session: AccountingWriteSession;
  result: SmsAnalysisResult;
  latestRecord: TransactionInboxRecord | null;
  latestJournal: Journal | null;
  latestProcessedIds: Set<string>;
  workplaceId: WorkplaceId;
  triggeredRuleIds: string[];
}): Promise<{
  inboxRecord: TransactionInboxRecordWriteData;
  autoPosted: boolean;
  journalResult?: JournalPersistenceResult;
}> {
  const {
    result,
    session,
    latestRecord,
    latestJournal,
    latestProcessedIds,
    workplaceId,
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

  let autoPosted = false;
  let journalResult: JournalPersistenceResult | undefined;

  if (result.autoPost && !linkedJournalId && finalStatus === InboxProcessingStatus.PENDING) {
    try {
      journalResult = await journalPersistenceService.putInSession(
        session,
        result.autoPost.journalData,
        workplaceId,
      );
      linkedJournalId = journalResult.journal.id;
      finalStatus = InboxProcessingStatus.AUTO_POSTED;
      autoPosted = true;
      triggeredRuleIds.push(result.autoPost.ruleId);
    } catch (error) {
      logger.warn(`SMS auto-post rule ${result.autoPost.ruleId} failed persistence validation`, {
        error,
      });
    }
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
  return { inboxRecord, autoPosted, journalResult };
}
