import { smsJournalQueries } from '@/src/data/repositories/journal/SmsJournalQueries';
import { transactionAutoPostRuleRepository } from '@/src/data/repositories/TransactionAutoPostRuleRepository';
import { transactionInboxRepository } from '@/src/data/repositories/TransactionInboxRepository';
import { runAccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import type { JournalPersistenceResult } from '@/src/data/repositories/journal/JournalPersistenceRepository';
import type { SmsMessage } from '@/modules/expo-sms-inbox';
import type Journal from '@/src/data/models/Journal';
import { analytics } from '@/src/services/analytics';
import { ParsedTransaction, SmsParser } from '@/src/services/ledger/SmsParser';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import {
  coalesceActionableDuplicate,
  findReferenceDuplicateMatch,
} from '@/src/services/sms/smsDuplicateDetection';
import { smsInboxBridge } from '@/src/services/sms/SmsInboxBridge';
import { smsRuleEngine } from '@/src/services/sms/SmsRuleEngine';
import { WorkplaceId } from '@/src/types/ids';
import { InboxParseStatus, InboxProcessingStatus } from '@/src/types/enums';
import { logger } from '@/src/utils/logger';
import { normalizeSmsReferenceNumber } from '@/src/utils/sms/SmsReferenceExtractor';
import { analyzeAutoPost } from './smsAutoPostAnalyzer';
import { findManyDuplicateCandidates } from './smsDuplicateMatcher';
import {
  computeSmsFingerprint,
  isStoredRedelivery,
  redeliveryFingerprintCandidates,
  resolveProcessingStatus,
} from './smsFingerprint';
import { processScanBatchItem } from './smsInboxRecordPreparer';
import { SmsAnalysisResult, SmsContentReservation } from './types';

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

  async scanInbox(workplaceId: WorkplaceId, limit: number, signal?: AbortSignal): Promise<number> {
    if (signal?.aborted) return 0;
    const previousScan = this.workplaceScans.get(workplaceId) ?? Promise.resolve();
    const scan = previousScan
      .catch(() => undefined)
      .then(() => {
        if (signal?.aborted) return 0;
        return this.scanInboxOnce(workplaceId, limit, signal);
      });
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
  ): Promise<number> {
    if (signal?.aborted) return 0;
    const start = Date.now();
    const messages = await smsInboxBridge.getLatestMessages(limit);
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

    // --- Phase 1: Parallel Async Analysis ---
    const candidateMessages = parsedMessages.filter(
      item => item.parsed.parseStatus !== InboxParseStatus.IGNORED,
    );

    const analysisResults: SmsAnalysisResult[] = await Promise.all(
      candidateMessages.map(async ({ message, parsed, fingerprint }) => {
        const existingRecord = existingMap.get(message.id) || null;
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
        let finalStatus = nextStatus;
        const finalJournalId = exactJournal?.id || fingerprintJournal?.id || undefined;

        if (
          parsed.parseStatus === InboxParseStatus.PARSED &&
          nextStatus === InboxProcessingStatus.PENDING
        ) {
          const ruleResult = await analyzeAutoPost(message, parsed, activeRules);
          if (ruleResult) {
            if (ruleResult.disposition === 'ignore') {
              finalStatus = InboxProcessingStatus.DISMISSED;
            } else if (ruleResult.disposition === 'auto_post' && ruleResult.createData) {
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
        };
      }),
    );

    // --- Phase 2: Synchronous Batching ---
    let importedCount = 0;
    let totalOps = 0;
    const triggeredRuleIds: string[] = [];

    if (analysisResults.length > 0 && !signal?.aborted) {
      const messageIds = analysisResults.map(result => result.message.id);
      const latestProcessedIds = new Set<string>();
      const reservedDeviceIds = new Set<string>();
      const reservedContents = new Map<string, SmsContentReservation[]>();
      const reservedReferences = new Map<string, import('@/src/types/ids').JournalId>();

      let stagedImportedCount = 0;
      let stagedOperationCount = 0;
      let journalResults: JournalPersistenceResult[] = [];
      let committed = false;
      try {
        journalResults = await runAccountingWriteSession(async session => {
          // These reads occur after acquiring the owning writer, so persisted duplicates
          // cannot slip between the final check and publication.
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
            const latestRecord = latestRecordsByMessageId.get(result.message.id) ?? null;
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
            transactionInboxRepository.stageUpsertInSession(
              session,
              item.inboxRecord,
              latestRecord,
              { correlationId: item.auditCorrelationId },
            );
            if (item.autoPosted) stagedImportedCount += 1;
            if (item.journalResult) journalResults.push(item.journalResult);
            stagedOperationCount += 1;
            if (item.autoPosted && result.autoPost) {
              stagedOperationCount +=
                result.autoPost.journalData.transactions.length +
                (result.autoPost.journalData.metadata ? 1 : 0) +
                2;
            }
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
        totalOps = stagedOperationCount;
        journalPersistenceService.afterAtomicWriteCommit(journalResults, workplaceId);
        triggeredRuleIds.forEach(ruleId => analytics.logSmsRuleTriggered(ruleId, true));
      }
    }

    logger.info(`[Trace] SmsSyncPipeline.scanInbox: ${Date.now() - start}ms`, {
      scannedMessages: messages.length,
      importedCount,
      totalOps,
    });

    return importedCount;
  }
}

export const smsSyncPipeline = new SmsSyncPipeline();
