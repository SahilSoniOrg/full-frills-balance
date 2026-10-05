import { smsJournalQueries } from '@/src/data/repositories/journal/SmsJournalQueries';
import { transactionAutoPostRuleRepository } from '@/src/data/repositories/TransactionAutoPostRuleRepository';
import { transactionInboxRepository } from '@/src/data/repositories/TransactionInboxRepository';
import { runAccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import type { JournalPersistenceResult } from '@/src/data/repositories/journal/journalPersistenceTypes';
import type { SmsMessage } from '@/modules/expo-sms-inbox';
import type Journal from '@/src/data/models/Journal';
import { analytics } from '@/src/services/analytics';
import { ParsedTransaction, SmsParser } from '@/src/services/ledger/SmsParser';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import {
  coalesceActionableDuplicate,
  findManyDuplicateCandidates,
  findReferenceDuplicateMatch,
} from '@/src/services/sms/smsDuplicateDetection';
import { smsInboxBridge } from '@/src/services/sms/SmsInboxBridge';
import { smsRuleEngine } from '@/src/services/sms/SmsRuleEngine';
import type { JournalId, WorkplaceId } from '@/src/types/ids';
import { InboxParseStatus, InboxProcessingStatus } from '@/src/types/enums';
import { preferences } from '@/src/services/preferences';
import { normalizeSmsReferenceNumber } from '@/src/utils/sms/SmsReferenceExtractor';
import { analyzeAutoPost } from './smsAutoPostAnalyzer';
import {
  computeSmsFingerprint,
  isStoredRedelivery,
  redeliveryFingerprintCandidates,
  resolveProcessingStatus,
} from './smsFingerprint';
import { processScanBatchItem, prepareUpsertInboxRecord } from './smsInboxRecordPreparer';
import { SmsAnalysisResult, SmsContentReservation } from './types';
import type { SmsScanOrigin } from '@/src/types/smsInbox';

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

    const activeRules = (
      await transactionAutoPostRuleRepository.findActiveByWorkplace(workplaceId)
    ).sort((a, b) => smsRuleEngine.getRulePriority(b) - smsRuleEngine.getRulePriority(a));

    const processedIds = new Set<string>();
    const existing = await transactionInboxRepository.findByDeviceSourceIds(
      workplaceId,
      messages.map(message => message.id),
    );
    const existingMap = new Map(existing.map(record => [record.deviceSourceId, record]));

    const parsedMessages = await Promise.all(
      messages.map(async msg => {
        const parsed = await SmsParser.parse(msg);
        const fingerprint = computeSmsFingerprint(msg.address, msg.body, msg.date);
        return { message: msg, parsed, fingerprint };
      }),
    );

    const messageIds = messages.map(m => m.id);

    const referenceNumbers = Array.from(
      new Set(
        parsedMessages
          .map(({ parsed }) => parsed.referenceNumber)
          .filter((referenceNumber): referenceNumber is string => Boolean(referenceNumber))
          .map(normalizeSmsReferenceNumber),
      ),
    );

    const [journalsById, redeliveredJournals, journalsByReference] = await Promise.all([
      smsJournalQueries.findJournalsByOriginalSmsIds(messageIds, workplaceId),
      findRedeliveredJournals(parsedMessages, workplaceId),
      smsJournalQueries.findJournalsByReferenceNumbers(referenceNumbers, workplaceId),
    ]);

    const parsedWithAmounts = parsedMessages.filter(
      m => m.parsed.parseStatus === InboxParseStatus.PARSED && m.parsed.amount,
    );

    const parsedForFuzzy = parsedWithAmounts.filter(({ parsed }) => !parsed.referenceNumber);

    const allCandidateJournals = await findManyDuplicateCandidates(parsedForFuzzy, workplaceId);

    const candidateMessages = parsedMessages.filter(
      item => item.parsed.parseStatus !== InboxParseStatus.IGNORED,
    );

    const analysisResults: SmsAnalysisResult[] = await Promise.all(
      candidateMessages.map(async ({ message, parsed, fingerprint }) => {
        const existingRecord =
          existingMap.get(message.id) ??
          (await transactionInboxRepository.findMatchingSms(
            workplaceId,
            prepareUpsertInboxRecord(
              message,
              parsed,
              fingerprint,
              null,
              InboxProcessingStatus.PENDING,
              workplaceId,
            ),
          ));
        const referenceDuplicate = findReferenceDuplicateMatch(parsed, journalsByReference);
        const duplicate = coalesceActionableDuplicate(
          referenceDuplicate,
          allCandidateJournals.get(message.id) || null,
        );
        const exactJournal = journalsById.get(message.id) || null;
        const fingerprintJournal = exactJournal
          ? null
          : redeliveredJournals.get(message.id) || null;

        const nextStatus = resolveProcessingStatus({
          parsed,
          processedIds,
          exactJournalId: exactJournal?.id || fingerprintJournal?.id,
          duplicate,
          existingStatus: existingRecord?.processingStatus,
        });

        let autoPost: SmsAnalysisResult['autoPost'] = undefined;
        let reviewRule: SmsAnalysisResult['reviewRule'] = undefined;
        let finalStatus = nextStatus;
        const finalJournalId = exactJournal?.id || fingerprintJournal?.id || undefined;

        if (
          parsed.parseStatus === InboxParseStatus.PARSED &&
          nextStatus === InboxProcessingStatus.PENDING
        ) {
          const ruleResult = await analyzeAutoPost(
            message,
            parsed,
            activeRules,
            preferences.device.isSmsAutoPostEnabled && !existingRecord?.consumedWorkplaces?.length,
          );
          if (ruleResult) {
            if (ruleResult.disposition === 'ignore') {
              finalStatus = InboxProcessingStatus.DISMISSED;
            } else if (ruleResult.disposition === 'review') {
              reviewRule = {
                sourceAccountId: ruleResult.sourceAccountId,
                categoryAccountId: ruleResult.categoryAccountId,
              };
            } else if (ruleResult.disposition === 'auto_post' && ruleResult.createData) {
              reviewRule = {
                sourceAccountId: ruleResult.sourceAccountId,
                categoryAccountId: ruleResult.categoryAccountId,
              };
              autoPost = {
                ruleId: ruleResult.ruleId,
                journalData: ruleResult.createData.journalData,
              };
              finalStatus = InboxProcessingStatus.AUTO_POSTED;
            }
          }
        }

        return {
          message,
          parsed,
          fingerprint,
          existingRecord,
          duplicate,
          exactJournalId: finalJournalId,
          finalStatus,
          autoPost,
          reviewRule,
        };
      }),
    );

    let importedCount = 0;
    const triggeredRuleIds: string[] = [];

    if (analysisResults.length > 0 && !signal?.aborted) {
      const messageIds = analysisResults.map(result => result.message.id);
      const latestProcessedIds = new Set<string>();
      const reservedDeviceIds = new Set<string>();
      const reservedContents = new Map<string, SmsContentReservation[]>();
      const reservedReferences = new Map<string, JournalId>();

      let stagedImportedCount = 0;
      let journalResults: JournalPersistenceResult[] = [];
      let committed = false;
      try {
        journalResults = await runAccountingWriteSession(async session => {
          const [latestRecords, latestJournalsById, latestRedeliveredJournals, latestByReference] =
            await Promise.all([
              transactionInboxRepository.findByDeviceSourceIds(workplaceId, messageIds),
              smsJournalQueries.findJournalsByOriginalSmsIds(messageIds, workplaceId),
              findRedeliveredJournals(analysisResults, workplaceId),
              smsJournalQueries.findJournalsByReferenceNumbers(referenceNumbers, workplaceId),
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
            const referenceJournal = result.parsed.referenceNumber
              ? latestByReference.get(normalizeSmsReferenceNumber(result.parsed.referenceNumber))
              : undefined;
            const latestReferenceDuplicate = referenceJournal
              ? findReferenceDuplicateMatch(
                  result.parsed,
                  new Map([
                    [normalizeSmsReferenceNumber(result.parsed.referenceNumber!), referenceJournal],
                  ]),
                )
              : null;

            const item = await processScanBatchItem({
              session,
              result,
              latestRecord,
              latestJournal,
              latestReferenceDuplicate,
              latestProcessedIds,
              reservedDeviceIds,
              reservedContents,
              reservedReferences,
              workplaceId,
              triggeredRuleIds,
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
                reviewRule: result.reviewRule,
              },
            );
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
        triggeredRuleIds.forEach(ruleId => analytics.logSmsRuleTriggered(ruleId, true));
      }
    }

    return importedCount;
  }
}

export const smsSyncPipeline = new SmsSyncPipeline();
