import { smsJournalQueries } from '@/src/data/repositories/journal/SmsJournalQueries';
import { transactionInboxRepository } from '@/src/data/repositories/TransactionInboxRepository';
import {
  findCaptureReferenceMatches,
  findCaptureReferenceCandidates,
} from '@/src/data/repositories/journal/CaptureReferenceMatchQueries';
import { stageLinkedCaptureSource } from '@/src/data/repositories/journal/captureSourceLinkStaging';
import { runAccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import type { JournalPersistenceResult } from '@/src/data/repositories/journal/journalPersistenceTypes';
import type { SmsMessage } from '@/modules/expo-sms-inbox';
import type Journal from '@/src/data/models/Journal';
import { analytics } from '@/src/services/analytics';
import {
  ParsedTransaction,
  SmsParser,
  toTransactionDirection,
} from '@/src/services/ledger/SmsParser';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import {
  coalesceActionableDuplicate,
  findManyDuplicateCandidates,
  findReferenceDuplicateMatch,
} from '@/src/services/sms/smsDuplicateDetection';
import { smsInboxBridge } from '@/src/services/sms/SmsInboxBridge';
import type { JournalId, WorkplaceId } from '@/src/types/ids';
import { InboxParseStatus, InboxProcessingStatus } from '@/src/types/enums';
import { normalizeSmsReferenceNumber } from '@/src/utils/sms/SmsReferenceExtractor';
import {
  computeSmsFingerprint,
  isStoredRedelivery,
  redeliveryFingerprintCandidates,
} from './smsFingerprint';
import { processScanBatchItem, prepareUpsertInboxRecord } from './smsInboxRecordPreparer';
import { SmsAnalysisResult, SmsContentReservation, SmsFuzzyReservation } from './types';
import type { SmsScanOrigin } from '@/src/types/smsInbox';
import { loadSmsDecisionContext } from './smsDecisionContext';
import { projectRecognition } from './smsDecision';

export interface SmsScanOptions {
  origin?: SmsScanOrigin;
  promptForPermission?: boolean;
}

class SmsScanCancelledError extends Error {}

async function findRedeliveredJournals(
  items: readonly { message: SmsMessage; parsed: ParsedTransaction }[],
  workplaceId: WorkplaceId,
): Promise<Map<string, Journal>> {
  const linked = await smsJournalQueries.findLinkedSmsRecordsByFingerprints(
    [...new Set(items.flatMap(({ message }) => redeliveryFingerprintCandidates(message)))],
    workplaceId,
  );
  const journals = new Map<string, Journal>();
  for (const { message, parsed } of items) {
    const match = linked.find(({ record }) => isStoredRedelivery(message, parsed, record));
    if (match) journals.set(message.id, match.journal);
  }
  return journals;
}

export class SmsSyncPipeline {
  private readonly workplaceScans = new Map<WorkplaceId, Promise<void>>();

  scanInbox(
    workplaceId: WorkplaceId,
    limit: number,
    signal?: AbortSignal,
    options: SmsScanOptions = {},
  ): Promise<number> {
    return this.enqueueScan(workplaceId, () =>
      this.scanInboxOnce(workplaceId, limit, signal, options),
    );
  }

  scanMessages(
    workplaceId: WorkplaceId,
    messages: readonly SmsMessage[],
    signal?: AbortSignal,
    options: SmsScanOptions = {},
  ): Promise<number> {
    return this.enqueueScan(workplaceId, () =>
      this.processMessages(workplaceId, messages, signal, options.origin ?? 'manual'),
    );
  }

  private async enqueueScan(
    workplaceId: WorkplaceId,
    createScan: () => Promise<number>,
  ): Promise<number> {
    const previousScan = this.workplaceScans.get(workplaceId) ?? Promise.resolve();
    const scan = previousScan.catch(() => undefined).then(createScan);
    const completion = scan.then(
      () => undefined,
      () => undefined,
    );

    this.workplaceScans.set(workplaceId, completion);

    try {
      return await scan;
    } finally {
      if (this.workplaceScans.get(workplaceId) === completion) {
        this.workplaceScans.delete(workplaceId);
      }
    }
  }

  private async scanInboxOnce(
    workplaceId: WorkplaceId,
    limit: number,
    signal?: AbortSignal,
    options: SmsScanOptions = {},
  ): Promise<number> {
    if (signal?.aborted) return 0;
    const messages = await smsInboxBridge.getLatestMessages(
      limit,
      options.promptForPermission ?? true,
    );
    return this.processMessages(workplaceId, messages, signal, options.origin ?? 'manual');
  }

  private async processMessages(
    workplaceId: WorkplaceId,
    messages: readonly SmsMessage[],
    signal?: AbortSignal,
    origin: SmsScanOrigin = 'manual',
  ): Promise<number> {
    if (signal?.aborted) return 0;
    if (messages.length === 0 || signal?.aborted) {
      return 0;
    }

    const parsedMessages = await Promise.all(
      messages.map(async msg => {
        const parsed = await SmsParser.parse(msg);
        const fingerprint = computeSmsFingerprint(msg.address, msg.body, msg.date);
        return { message: msg, parsed, fingerprint };
      }),
    );

    const referenceNumbers = Array.from(
      new Set(
        parsedMessages
          .map(({ parsed }) => parsed.referenceNumber)
          .filter((referenceNumber): referenceNumber is string => Boolean(referenceNumber))
          .map(normalizeSmsReferenceNumber),
      ),
    );

    const parsedWithAmounts = parsedMessages.filter(
      m => m.parsed.parseStatus === InboxParseStatus.PARSED && m.parsed.amount,
    );
    const parsedForFuzzy = parsedWithAmounts.filter(({ parsed }) => !parsed.referenceNumber);

    const candidateMessages = parsedMessages.filter(
      item => item.parsed.parseStatus !== InboxParseStatus.IGNORED,
    );

    const analysisResults: SmsAnalysisResult[] = candidateMessages.map(
      ({ message, parsed, fingerprint }) => ({ message, parsed, fingerprint, duplicate: null }),
    );

    let importedCount = 0;

    if (analysisResults.length > 0 && !signal?.aborted) {
      const messageIds = analysisResults.map(result => result.message.id);
      const latestProcessedIds = new Set<string>();
      const reservedDeviceIds = new Set<string>();
      const reservedContents = new Map<string, SmsContentReservation[]>();
      const reservedReferences = new Map<string, JournalId>();
      const reservedFuzzy: SmsFuzzyReservation[] = [];

      let stagedImportedCount = 0;
      let journalResults: JournalPersistenceResult[] = [];
      let committed = false;
      try {
        journalResults = await runAccountingWriteSession(async session => {
          // Decide once inside the serialized writer, using the current capture permission and matchers,
          // disposition, and duplicate state for both review hints and auto-posting.
          const [
            decisionContext,
            latestRecords,
            latestJournalsById,
            latestRedeliveredJournals,
            latestByReference,
            latestFuzzyCandidates,
          ] = await Promise.all([
            loadSmsDecisionContext(workplaceId),
            transactionInboxRepository.findByDeviceSourceIds(workplaceId, messageIds),
            smsJournalQueries.findJournalsByOriginalSmsIds(messageIds, workplaceId),
            findRedeliveredJournals(analysisResults, workplaceId),
            smsJournalQueries.findJournalsByReferenceNumbers(referenceNumbers, workplaceId),
            findManyDuplicateCandidates(parsedForFuzzy, workplaceId),
          ]);
          const latestRecordsByMessageId = new Map(
            latestRecords.map(record => [record.deviceSourceId, record]),
          );
          for (const result of analysisResults) {
            if (signal?.aborted) throw new SmsScanCancelledError();
            if (reservedDeviceIds.has(result.message.id)) continue;
            const latestRecord =
              latestRecordsByMessageId.get(result.message.id) ??
              (await transactionInboxRepository.findMatchingSms(
                workplaceId,
                prepareUpsertInboxRecord(
                  result.message,
                  result.parsed,
                  result.fingerprint,
                  null,
                  InboxProcessingStatus.PENDING,
                  workplaceId,
                ),
              ));
            const latestJournal =
              latestJournalsById.get(result.message.id) ??
              latestRedeliveredJournals.get(result.message.id) ??
              null;
            let crossSourceJournal: Journal | undefined;
            if (
              !latestJournal &&
              !latestRecord?.linkedJournalId &&
              (!latestRecord || latestRecord.processingStatus === InboxProcessingStatus.PENDING) &&
              !latestRecord?.consumedWorkplaces?.length &&
              result.parsed.parseStatus === InboxParseStatus.PARSED &&
              result.parsed.amountReliableForCapture === true &&
              result.parsed.referenceNumber &&
              result.parsed.amount &&
              result.parsed.currencyCode
            ) {
              const recognition = projectRecognition(
                result.message,
                result.parsed,
                decisionContext,
              ).recognition;
              if (
                recognition.status === 'recognized' &&
                !recognition.hold &&
                recognition.accountIds.length === 1
              ) {
                const matches = await findCaptureReferenceMatches({
                  workplaceId,
                  reference: normalizeSmsReferenceNumber(result.parsed.referenceNumber),
                  amount: result.parsed.amount,
                  currencyCode: result.parsed.currencyCode,
                  accountId: recognition.accountIds[0],
                  direction: toTransactionDirection(result.parsed.type),
                  receivedAt: result.message.date,
                  requireOtherObservation: true,
                });
                if (matches.length === 1) crossSourceJournal = matches[0];
              }
            }
            const referenceJournal = result.parsed.referenceNumber
              ? latestByReference.get(normalizeSmsReferenceNumber(result.parsed.referenceNumber))
              : undefined;
            const compatibleReferences =
              result.parsed.referenceNumber && result.parsed.amount && result.parsed.currencyCode
                ? await findCaptureReferenceCandidates({
                    workplaceId,
                    reference: normalizeSmsReferenceNumber(result.parsed.referenceNumber),
                    amount: result.parsed.amount,
                    currencyCode: result.parsed.currencyCode,
                  })
                : [];
            const matchingReferenceJournal = compatibleReferences[0] ?? referenceJournal;
            const latestReferenceDuplicate = matchingReferenceJournal
              ? findReferenceDuplicateMatch(
                  result.parsed,
                  new Map([
                    [
                      normalizeSmsReferenceNumber(result.parsed.referenceNumber!),
                      matchingReferenceJournal,
                    ],
                  ]),
                )
              : null;

            const item = await processScanBatchItem({
              session,
              result: {
                ...result,
                duplicate: coalesceActionableDuplicate(
                  latestReferenceDuplicate,
                  latestFuzzyCandidates.get(result.message.id) ?? null,
                ),
              },
              decisionContext,
              latestRecord,
              latestJournal: latestJournal ?? crossSourceJournal ?? null,
              latestReferenceDuplicate,
              latestProcessedIds,
              reservedDeviceIds,
              reservedContents,
              reservedReferences,
              reservedFuzzy,
              workplaceId,
              allowAutomaticCapture: origin === 'arrival' || origin === 'catch_up',
            });
            await transactionInboxRepository.stageUpsertInSession(
              session,
              item.inboxRecord,
              latestRecord,
              { correlationId: item.auditCorrelationId },
              {
                origin,
                source: { senderAddress: result.message.address, rawBody: result.message.body },
                queueReview:
                  (origin === 'arrival' || origin === 'catch_up') &&
                  [InboxProcessingStatus.PENDING, InboxProcessingStatus.PARSE_FAILED].includes(
                    item.inboxRecord.processingStatus,
                  ),
                suggestedAccounts:
                  item.decision.kind === 'ignore' ? undefined : item.decision.suggestedAccounts,
                recognition: item.decision.recognition,
              },
            );
            if (
              crossSourceJournal &&
              item.inboxRecord.linkedJournalId === crossSourceJournal.id &&
              item.inboxRecord.processingStatus === InboxProcessingStatus.IMPORTED
            ) {
              await stageLinkedCaptureSource(session, workplaceId, crossSourceJournal.id, {
                channel: 'sms',
                sourceId: result.message.id,
                occurredAt: result.message.date,
                fingerprint: result.fingerprint,
                merchant: result.parsed.merchant,
              });
            }
            if (item.autoPosted) stagedImportedCount += 1;
            if (item.journalResult) journalResults.push(item.journalResult);
          }
          if (signal?.aborted) throw new SmsScanCancelledError();
          return journalResults;
        });
        committed = true;
      } catch (error) {
        if (!(error instanceof SmsScanCancelledError)) throw error;
      }

      if (committed) {
        importedCount = stagedImportedCount;
        journalPersistenceService.afterAtomicWriteCommit(journalResults, workplaceId);
        if (importedCount > 0)
          analytics.trackFeatureUsage('transaction_capture', 'captured', { count: importedCount });
      }
    }

    return importedCount;
  }
}

export const smsSyncPipeline = new SmsSyncPipeline();
