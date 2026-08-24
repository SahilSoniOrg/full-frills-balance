import { AppConfig } from '@/src/constants';
import { database } from '@/src/data/database/Database';
import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import { smsJournalQueries } from '@/src/data/repositories/journal/journalSmsModule';
import { transactionAutoPostRuleRepository } from '@/src/data/repositories/TransactionAutoPostRuleRepository';
import { transactionInboxRepository } from '@/src/data/repositories/TransactionInboxRepository';
import { analytics } from '@/src/services/analytics';
import { SmsParser } from '@/src/services/ledger/SmsParser';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import {
  coalesceActionableDuplicate,
  findReferenceDuplicateMatch,
} from '@/src/services/sms/smsDuplicateDetection';
import { smsInboxBridge } from '@/src/services/sms/SmsInboxBridge';
import { smsRuleEngine } from '@/src/services/sms/SmsRuleEngine';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { InboxParseStatus, InboxProcessingStatus } from '@/src/types/enums';
import { logger } from '@/src/utils/logger';
import { safeParseJSON } from '@/src/utils/serialization';
import { normalizeSmsReferenceNumber } from '@/src/utils/sms/SmsReferenceExtractor';
import { storage } from '@/src/utils/storage';
import { Model, Q } from '@nozbe/watermelondb';
import { analyzeAutoPost } from './smsAutoPostAnalyzer';
import { findManyDuplicateCandidates } from './smsDuplicateMatcher';
import { computeSmsFingerprint, resolveProcessingStatus } from './smsFingerprint';
import { processScanBatchItem } from './smsInboxRecordPreparer';
import { SmsAnalysisResult } from './types';

export class SmsSyncPipeline {
  private readonly PROCESSED_SMS_KEY = '@processed_sms_ids';
  private readonly workplaceScans = new Map<WorkplaceId, Promise<void>>();

  private get inbox() {
    return database.collections.get<TransactionInboxRecord>('transaction_inbox_records');
  }

  getProcessedSmsIds(): string[] {
    try {
      const data = storage.getString(this.PROCESSED_SMS_KEY);
      return data ? safeParseJSON(data, []) : [];
    } catch (error) {
      logger.error('Failed to get processed SMS IDs from MMKV', error);
      return [];
    }
  }

  markSmsAsProcessed(smsId: string): void {
    try {
      const processedIds = this.getProcessedSmsIds();
      if (!processedIds.includes(smsId)) {
        processedIds.push(smsId);
        const maxStored = AppConfig.input.sms.maxStoredProcessedIds;
        if (processedIds.length > maxStored) {
          processedIds.splice(0, processedIds.length - maxStored);
        }
        storage.set(this.PROCESSED_SMS_KEY, JSON.stringify(processedIds));
      }
    } catch (error) {
      logger.error('Failed to mark SMS as processed in MMKV', error);
    }
  }

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

    const processedIds = new Set(this.getProcessedSmsIds());
    const existing = await this.inbox
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('channel', 'sms'),
        Q.where('device_source_id', Q.oneOf(messages.map(message => message.id))),
      )
      .fetch();
    const existingMap = new Map(existing.map(record => [record.deviceSourceId, record]));

    const parsedMessages = await Promise.all(
      messages.map(async msg => {
        const parsed = await SmsParser.parse(msg);
        const fingerprint = computeSmsFingerprint(msg.address, msg.body, msg.date);
        return { message: msg, parsed, fingerprint };
      }),
    );

    const messageIds = messages.map(m => m.id);
    const fingerprints = parsedMessages.map(m => m.fingerprint);

    const referenceNumbers = Array.from(
      new Set(
        parsedMessages
          .map(({ parsed }) => parsed.referenceNumber)
          .filter((referenceNumber): referenceNumber is string => Boolean(referenceNumber))
          .map(normalizeSmsReferenceNumber),
      ),
    );

    const [journalsById, journalsByFingerprint, journalsByReference] = await Promise.all([
      smsJournalQueries.findJournalsByOriginalSmsIds(messageIds, workplaceId),
      smsJournalQueries.findJournalsBySmsFingerprints(fingerprints, workplaceId),
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
          : journalsByFingerprint.get(fingerprint) || null;

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
          const ruleResult = await analyzeAutoPost(message, parsed, activeRules, workplaceId);
          if (ruleResult) {
            if (ruleResult.disposition === 'ignore') {
              finalStatus = InboxProcessingStatus.DISMISSED;
            } else if (ruleResult.disposition === 'auto_post' && ruleResult.createData) {
              autoPost = {
                ruleId: ruleResult.ruleId,
                journalData: ruleResult.createData.journalData,
                preparedJournal: ruleResult.createData.preparedJournal,
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
    const allAccountsToRebuild = new Set<AccountId>();
    const processedMessageIds: string[] = [];
    const triggeredRuleIds: string[] = [];

    if (analysisResults.length > 0 && !signal?.aborted) {
      // Re-fetch records and journals inside the write transaction to guard
      // against concurrent mutations that may have occurred since Phase 1.
      await transactionInboxRepository.persistScanBatch(
        async () => {
          if (signal?.aborted) return [];
          const messageIds = analysisResults.map(result => result.message.id);
          const fingerprints = analysisResults.map(result => result.fingerprint);
          const [latestRecords, latestJournalsById, latestJournalsByFingerprint] =
            await Promise.all([
              this.inbox
                .query(
                  Q.where('workplace_id', workplaceId),
                  Q.where('channel', 'sms'),
                  Q.where('device_source_id', Q.oneOf(messageIds)),
                )
                .fetch(),
              smsJournalQueries.findJournalsByOriginalSmsIds(messageIds, workplaceId),
              smsJournalQueries.findJournalsBySmsFingerprints(fingerprints, workplaceId),
            ]);
          const latestRecordsByMessageId = new Map(
            latestRecords.map(record => [record.deviceSourceId, record]),
          );
          const latestProcessedIds = new Set(this.getProcessedSmsIds());
          const allOps: Model[] = [];

          for (const result of analysisResults) {
            const latestRecord = latestRecordsByMessageId.get(result.message.id) ?? null;
            const latestJournal =
              latestJournalsById.get(result.message.id) ??
              latestJournalsByFingerprint.get(result.fingerprint) ??
              null;

            const { ops, record, autoPosted } = processScanBatchItem({
              result,
              latestRecord,
              latestJournal,
              latestProcessedIds,
              workplaceId,
              allAccountsToRebuild,
              processedMessageIds,
              triggeredRuleIds,
            });

            allOps.push(...ops);
            if (autoPosted) importedCount += 1;
            latestRecordsByMessageId.set(result.message.id, record);
          }

          totalOps = allOps.length;
          return allOps;
        },
        () => {
          if (allAccountsToRebuild.size > 0) {
            const latestDate = Math.max(...messages.map(m => m.date));
            rebuildQueueService.enqueueMany(allAccountsToRebuild, latestDate, workplaceId);
          }
        },
      );

      processedMessageIds.forEach(messageId => this.markSmsAsProcessed(messageId));
      triggeredRuleIds.forEach(ruleId => analytics.logSmsRuleTriggered(ruleId, true));
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
