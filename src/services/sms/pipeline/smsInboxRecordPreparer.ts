import { SmsMessage } from '@/modules/expo-sms-inbox';
import Journal from '@/src/data/models/Journal';
import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import { TransactionInboxRecordWriteData } from '@/src/data/repositories/TransactionInboxRepository';
import { generator } from '@/src/data/database/idGenerator';
import type { AccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import type { JournalPersistenceResult } from '@/src/data/repositories/journal/JournalPersistenceRepository';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import { ParsedTransaction, toTransactionDirection } from '@/src/services/ledger/SmsParser';
import { JournalId, WorkplaceId } from '@/src/types/ids';
import { InboxProcessingStatus } from '@/src/types/enums';
import { safeParseJSON } from '@/src/utils/serialization';
import { normalizeSmsReferenceNumber } from '@/src/utils/sms/SmsReferenceExtractor';
import { AppConfig } from '@/src/constants';
import { buildReferenceDuplicateMatch } from '@/src/services/sms/smsDuplicateDetection';
import { logger } from '@/src/utils/logger';
import { computeSmsReservationKey, resolveProcessingStatus } from './smsFingerprint';
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
  latestReferenceDuplicate?: import('@/src/services/sms/smsDuplicateDetection').DuplicateMatch;
  latestProcessedIds: Set<string>;
  reservedDeviceIds: Set<string>;
  reservedFingerprints: Map<string, JournalId>;
  reservedReferences: Map<string, JournalId>;
  workplaceId: WorkplaceId;
  triggeredRuleIds: string[];
}): Promise<{
  inboxRecord: TransactionInboxRecordWriteData;
  autoPosted: boolean;
  auditCorrelationId?: string;
  journalResult?: JournalPersistenceResult;
}> {
  const {
    result,
    session,
    latestRecord,
    latestJournal,
    latestReferenceDuplicate,
    latestProcessedIds,
    reservedDeviceIds,
    reservedFingerprints,
    reservedReferences,
    workplaceId,
    triggeredRuleIds,
  } = params;

  let linkedJournalId = latestJournal?.id ?? latestRecord?.linkedJournalId;
  let effectiveDuplicate = latestReferenceDuplicate ?? result.duplicate;
  let finalStatus = resolveProcessingStatus({
    parsed: result.parsed,
    processedIds: latestProcessedIds,
    exactJournalId: linkedJournalId,
    duplicate: effectiveDuplicate,
    existingStatus: latestRecord?.processingStatus,
  });

  const reference = result.parsed.referenceNumber
    ? normalizeSmsReferenceNumber(result.parsed.referenceNumber)
    : undefined;
  // A reused reference must retain every compatible claim within this batch.
  const referenceReservationKey =
    reference && result.parsed.amount != null
      ? JSON.stringify([
          reference,
          result.parsed.amount,
          result.parsed.currencyCode?.toUpperCase(),
          toTransactionDirection(result.parsed.type),
        ])
      : undefined;
  reservedDeviceIds.add(result.message.id);
  const reservedReferenceJournalId = referenceReservationKey
    ? reservedReferences.get(referenceReservationKey)
    : undefined;
  const reservationKey = computeSmsReservationKey(
    result.message.address,
    result.message.body,
    result.message.date,
  );
  const reservedJournalId = reservedReferenceJournalId ?? reservedFingerprints.get(reservationKey);
  if (!linkedJournalId && reservedJournalId) {
    effectiveDuplicate = reservedReferenceJournalId
      ? buildReferenceDuplicateMatch(reservedJournalId, result.parsed.referenceNumber!)
      : {
          journalId: reservedJournalId,
          score: AppConfig.input.sms.duplicateDetection.scoreThreshold,
          reasons: ['Exact SMS content within this scan'],
        };
    finalStatus = InboxProcessingStatus.DUPLICATE_FLAGGED;
  }

  if (
    result.finalStatus === InboxProcessingStatus.DISMISSED &&
    finalStatus === InboxProcessingStatus.PENDING
  ) {
    finalStatus = InboxProcessingStatus.DISMISSED;
  }

  let autoPosted = false;
  let auditCorrelationId: string | undefined;
  let journalResult: JournalPersistenceResult | undefined;

  if (result.autoPost && !linkedJournalId && finalStatus === InboxProcessingStatus.PENDING) {
    try {
      auditCorrelationId = generator();
      journalResult = await journalPersistenceService.putInSession(
        session,
        result.autoPost.journalData,
        workplaceId,
        {
          eventType: 'journal.sms_auto_posted',
          source: 'system',
          correlationId: auditCorrelationId,
          undoable: false,
        },
      );
      linkedJournalId = journalResult.journal.id;
      finalStatus = InboxProcessingStatus.AUTO_POSTED;
      autoPosted = true;
      if (result.parsed.id) latestProcessedIds.add(result.parsed.id);
      reservedFingerprints.set(reservationKey, linkedJournalId);
      if (referenceReservationKey) {
        reservedReferences.set(referenceReservationKey, linkedJournalId);
      }
      triggeredRuleIds.push(result.autoPost.ruleId);
    } catch (error) {
      auditCorrelationId = undefined;
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
    effectiveDuplicate || undefined,
  );
  return { inboxRecord, autoPosted, auditCorrelationId, journalResult };
}
