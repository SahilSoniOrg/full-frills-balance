import { SmsMessage } from '@/modules/expo-sms-inbox';
import Journal from '@/src/data/models/Journal';
import type { InboxRecordSnapshot, TransactionInboxRecordWriteData } from '@/src/types/smsInbox';
import { smsContentDigest } from '@/src/utils/smsDeliveryIdentity';
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
import {
  buildReferenceDuplicateMatch,
  type DuplicateMatch,
} from '@/src/services/sms/smsDuplicateDetection';
import { preferences } from '@/src/services/preferences';
import { logger } from '@/src/utils/logger';
import { resolveProcessingStatus } from './smsFingerprint';
import { sanitizeSmsMetadataJson } from '@/src/utils/smsPrivateMetadata';
import { SmsAnalysisResult, SmsContentReservation } from './types';

export function prepareUpsertInboxRecord(
  sms: SmsMessage,
  parsed: ParsedTransaction,
  fingerprint: string,
  existingRecord: InboxRecordSnapshot | null,
  processingStatus: InboxProcessingStatus,
  workplaceId: WorkplaceId,
  linkedJournalId?: JournalId,
  duplicate?: { journalId: JournalId; score: number; reasons: string[] },
): TransactionInboxRecordWriteData {
  const now = Date.now();
  const existingMetadata = existingRecord?.metadataJson
    ? safeParseJSON<Record<string, unknown>>(existingRecord.metadataJson, {})
    : {};
  const cleanedMetadata = sanitizeSmsMetadataJson(JSON.stringify(existingMetadata), true);
  const metadataJson = JSON.stringify({
    ...(cleanedMetadata ? safeParseJSON<Record<string, unknown>>(cleanedMetadata, {}) : {}),
    ...(duplicate ? { duplicateReasons: duplicate.reasons } : {}),
  });
  // Scan-dismissed messages (non-transactions, ignore rules) never gain raw text; a record the
  // user dismissed keeps what it already holds so it stays restorable.
  const rawContent =
    processingStatus === InboxProcessingStatus.DISMISSED
      ? { senderAddress: existingRecord?.senderAddress, rawBody: existingRecord?.rawBody }
      : { senderAddress: sms.address, rawBody: sms.body };
  return {
    workplaceId,
    deviceInboxId: existingRecord?.deviceInboxId ?? existingRecord?.id ?? generator(),
    contentDigest: smsContentDigest(sms.address, sms.body),
    parseConfidence: parsed.confidence,
    parseReason: parsed.parseReason,
    channel: 'sms' as const,
    deviceSourceId: existingRecord?.deviceSourceId ?? sms.id,
    providerSourceId: sms.id,
    ...rawContent,
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
  latestRecord: InboxRecordSnapshot | null;
  latestJournal: Journal | null;
  latestReferenceDuplicate?: DuplicateMatch;
  latestProcessedIds: Set<string>;
  reservedDeviceIds: Set<string>;
  reservedContents: Map<string, SmsContentReservation[]>;
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
    reservedContents,
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
  // The persisted fingerprint truncates content and buckets by day. Same-scan claims
  // retain full text and parsed identity, then compare actual delivery timestamps.
  const contentReservationKey = JSON.stringify([
    result.message.address.toLowerCase(),
    result.message.body,
    reference,
    result.parsed.amount,
    result.parsed.currencyCode?.toUpperCase(),
    toTransactionDirection(result.parsed.type),
  ]);
  const reservedContent = reservedContents
    .get(contentReservationKey)
    ?.find(
      reservation =>
        Math.abs(result.message.date - reservation.messageDate) <=
        AppConfig.input.sms.duplicateDetection.redeliveryWindowMs,
    );
  const reservedReferenceJournalId = referenceReservationKey
    ? reservedReferences.get(referenceReservationKey)
    : undefined;
  const reservedJournalId = reservedReferenceJournalId ?? reservedContent?.journalId;
  if (!linkedJournalId && reservedJournalId) {
    effectiveDuplicate = reservedReferenceJournalId
      ? buildReferenceDuplicateMatch(reservedJournalId, result.parsed.referenceNumber!)
      : {
          journalId: reservedJournalId,
          score: AppConfig.input.sms.duplicateDetection.scoreThreshold,
          reasons: ['Same SMS content delivered within seconds in this scan'],
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

  if (
    result.autoPost &&
    preferences.device.isSmsAutoPostEnabled &&
    !latestRecord?.consumedWorkplaces?.length &&
    !linkedJournalId &&
    finalStatus === InboxProcessingStatus.PENDING
  ) {
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
      const contentReservations = reservedContents.get(contentReservationKey) ?? [];
      contentReservations.push({ journalId: linkedJournalId, messageDate: result.message.date });
      reservedContents.set(contentReservationKey, contentReservations);
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
