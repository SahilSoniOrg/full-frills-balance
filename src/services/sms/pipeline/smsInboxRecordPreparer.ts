import { SmsMessage } from '@/modules/expo-sms-inbox';
import Journal from '@/src/data/models/Journal';
import type { InboxRecordSnapshot, TransactionInboxRecordWriteData } from '@/src/types/smsInbox';
import { smsContentDigest } from '@/src/utils/smsDeliveryIdentity';
import { generator } from '@/src/data/database/idGenerator';
import type { AccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import type { JournalPersistenceResult } from '@/src/data/repositories/journal/journalPersistenceTypes';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import { ParsedTransaction, toTransactionDirection } from '@/src/services/ledger/SmsParser';
import { JournalId, WorkplaceId } from '@/src/types/ids';
import { InboxProcessingStatus } from '@/src/types/enums';
import { safeParseJSON } from '@/src/utils/serialization';
import { normalizeSmsReferenceNumber } from '@/src/utils/sms/SmsReferenceExtractor';
import { AppConfig } from '@/src/constants';
import {
  buildReferenceDuplicateMatch,
  isDuplicateAboveThreshold,
  scoreFuzzyDuplicateMatch,
  type DuplicateMatch,
} from '@/src/services/sms/smsDuplicateDetection';
import { logger } from '@/src/utils/logger';
import { resolveProcessingStatus } from './smsFingerprint';
import { sanitizeSmsMetadataJson } from '@/src/utils/smsPrivateMetadata';
import { SmsAnalysisResult, SmsContentReservation, SmsFuzzyReservation } from './types';
import { decideSms, type SmsDecision } from './smsDecision';
import type { SmsDecisionContext } from './smsDecisionContext';

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
  // Scan-dismissed messages never gain raw text; a record the
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
  decisionContext: SmsDecisionContext;
  latestRecord: InboxRecordSnapshot | null;
  latestJournal: Journal | null;
  latestReferenceDuplicate?: DuplicateMatch;
  latestProcessedIds: Set<string>;
  reservedDeviceIds: Set<string>;
  reservedContents: Map<string, SmsContentReservation[]>;
  reservedReferences: Map<string, JournalId>;
  reservedFuzzy: SmsFuzzyReservation[];
  workplaceId: WorkplaceId;
  allowAutomaticCapture?: boolean;
}): Promise<{
  inboxRecord: TransactionInboxRecordWriteData;
  autoPosted: boolean;
  auditCorrelationId?: string;
  journalResult?: JournalPersistenceResult;
  decision: SmsDecision;
}> {
  const {
    result,
    decisionContext,
    session,
    latestRecord,
    latestJournal,
    latestReferenceDuplicate,
    latestProcessedIds,
    reservedDeviceIds,
    reservedContents,
    reservedReferences,
    reservedFuzzy,
    workplaceId,
    allowAutomaticCapture = false,
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
  // The two notifications for an own-account transfer have opposite directions.
  // A same-batch match is still a candidate, not proof of identity.
  const oppositeReferenceReservationKey =
    reference && result.parsed.amount != null && result.parsed.type !== 'unknown'
      ? JSON.stringify([
          reference,
          result.parsed.amount,
          result.parsed.currencyCode?.toUpperCase(),
          toTransactionDirection(result.parsed.type === 'debit' ? 'credit' : 'debit'),
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
  const reservedReferenceJournalId =
    (referenceReservationKey ? reservedReferences.get(referenceReservationKey) : undefined) ??
    (oppositeReferenceReservationKey
      ? reservedReferences.get(oppositeReferenceReservationKey)
      : undefined);
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

  if (!linkedJournalId && !reference && finalStatus === InboxProcessingStatus.PENDING) {
    for (const reservation of reservedFuzzy) {
      if (
        reservation.amount !== result.parsed.amount ||
        (reservation.currencyCode &&
          result.parsed.currencyCode &&
          reservation.currencyCode !== result.parsed.currencyCode)
      )
        continue;
      const match = scoreFuzzyDuplicateMatch({
        journalDate: reservation.messageDate,
        messageDate: result.message.date,
        preservedMerchants: reservation.merchant ? [reservation.merchant] : undefined,
        merchant: result.parsed.merchant,
      });
      const candidate = { journalId: reservation.journalId, ...match };
      if (isDuplicateAboveThreshold(candidate)) {
        effectiveDuplicate = candidate;
        finalStatus = InboxProcessingStatus.DUPLICATE_FLAGGED;
        break;
      }
    }
  }

  const statusAtDecision = finalStatus;
  const previousMetadata = safeParseJSON<Record<string, unknown>>(
    latestRecord?.metadataJson ?? '{}',
    {},
  );
  const alreadyHeldForReview =
    previousMetadata.captureAutoPostBlocked === true ||
    typeof previousMetadata.captureReviewReason === 'string';
  const allowAutoPost =
    allowAutomaticCapture && !latestRecord?.consumedWorkplaces?.length && !alreadyHeldForReview;
  const decision = decideSms(
    result.message,
    result.parsed,
    decisionContext,
    statusAtDecision,
    allowAutoPost,
  );
  if (decision.kind === 'ignore' && statusAtDecision === InboxProcessingStatus.PENDING) {
    finalStatus = InboxProcessingStatus.DISMISSED;
  }

  let autoPosted = false;
  let auditCorrelationId: string | undefined;
  let journalResult: JournalPersistenceResult | undefined;

  if (decision.kind === 'post' && !linkedJournalId && finalStatus === statusAtDecision) {
    try {
      auditCorrelationId = generator();
      journalResult = await journalPersistenceService.putInSession(
        session,
        decision.journalData,
        workplaceId,
        {
          eventType: 'journal.automatically_captured',
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
      if (result.parsed.amount) {
        reservedFuzzy.push({
          journalId: linkedJournalId,
          messageDate: result.message.date,
          amount: result.parsed.amount,
          currencyCode: result.parsed.currencyCode,
          merchant: result.parsed.merchant,
        });
      }
    } catch (error) {
      auditCorrelationId = undefined;
      logger.warn('Automatic capture failed journal validation', {
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
  const remainsInReview = [
    InboxProcessingStatus.PENDING,
    InboxProcessingStatus.PARSE_FAILED,
    InboxProcessingStatus.DUPLICATE_FLAGGED,
  ].includes(inboxRecord.processingStatus);
  // Sticky block only for explicit review holds. Manual/catch scans with auto-post off
  // return kind:'review' without a reason and must not poison later arrival auto-post.
  if (remainsInReview && decision.kind === 'review' && decision.reason) {
    const metadata = safeParseJSON<Record<string, unknown>>(inboxRecord.metadataJson ?? '{}', {});
    inboxRecord.metadataJson = JSON.stringify({
      ...metadata,
      captureAutoPostBlocked: true,
      captureReviewReason: decision.reason,
    });
  }
  return { inboxRecord, autoPosted, auditCorrelationId, journalResult, decision };
}
