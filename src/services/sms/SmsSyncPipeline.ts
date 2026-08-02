import { SmsMessage } from '@/modules/expo-sms-inbox';
import { AppConfig } from '@/src/constants';
import { database } from '@/src/data/database/Database';
import { JournalStatus } from '@/src/data/models/Journal';
import { TransactionType } from '@/src/data/models/Transaction';
import TransactionAutoPostRule from '@/src/data/models/TransactionAutoPostRule';
import TransactionInboxRecord, {
  InboxParseStatus,
  InboxProcessingStatus,
  TransactionDirection,
} from '@/src/data/models/TransactionInboxRecord';
import { CreateJournalData } from '@/src/data/repositories/journal/journalWriteModule';
import { smsJournalQueries } from '@/src/data/repositories/journal/journalSmsModule';
import { transactionAutoPostRuleRepository } from '@/src/data/repositories/TransactionAutoPostRuleRepository';
import { analytics } from '@/src/services/analytics-service';
import { ledgerWriteService } from '@/src/services/ledger';
import { PreparedJournalData, prepareJournalData } from '@/src/services/ledger/prepareJournalData';
import { SmsMatchData } from '@/src/services/ledger/RuleMatcher';
import {
  ParsedTransaction,
  SmsParser,
  toTransactionDirection,
} from '@/src/services/ledger/SmsParser';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { smsInboxBridge } from '@/src/services/sms/SmsInboxBridge';
import { smsRuleEngine } from '@/src/services/sms/SmsRuleEngine';
import { JournalId, AccountId, WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { safeParseJSON } from '@/src/utils/serialization';
import { storage } from '@/src/utils/storage';
import { Model, Q } from '@nozbe/watermelondb';

const SMS_CONFIG = AppConfig.input.sms;
const DUPLICATE_CONFIG = SMS_CONFIG.duplicateDetection;

type DuplicateMatch = {
  journalId: JournalId;
  score: number;
  reasons: string[];
} | null;

interface SmsAnalysisResult {
  message: SmsMessage;
  parsed: ParsedTransaction;
  fingerprint: string;
  existingRecord: TransactionInboxRecord | null;
  duplicate: DuplicateMatch;
  exactJournalId?: JournalId;
  finalStatus: InboxProcessingStatus;
  autoPost?: {
    ruleId: string;
    journalData: CreateJournalData;
    preparedJournal: PreparedJournalData;
  };
}

export class SmsSyncPipeline {
  private readonly PROCESSED_SMS_KEY = '@processed_sms_ids';

  private get inbox() {
    return database.collections.get<TransactionInboxRecord>('transaction_inbox_records');
  }

  private getProcessedSmsIds(): string[] {
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

  computeSmsFingerprint(sender: string, body: string, date: number): string {
    const normalizedSender = sender.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedBody = body
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^a-z0-9 ]/g, '')
      .trim();
    const dateBucket = Math.floor(date / DUPLICATE_CONFIG.dayWindowMs);
    return `${normalizedSender}::${normalizedBody.slice(0, 160)}::${dateBucket}`;
  }

  toDirection(type: 'debit' | 'credit' | 'unknown'): TransactionDirection {
    return toTransactionDirection(type);
  }

  resolveProcessingStatus(params: {
    parsed: ParsedTransaction;
    processedIds: Set<string>;
    exactJournalId?: string;
    duplicate: DuplicateMatch;
    existingStatus?: InboxProcessingStatus;
  }): InboxProcessingStatus {
    const { parsed, processedIds, exactJournalId, duplicate, existingStatus } = params;

    if (existingStatus) return existingStatus;
    if (parsed.parseStatus === InboxParseStatus.PARSE_FAILED)
      return InboxProcessingStatus.PARSE_FAILED;
    if (parsed.parseStatus === InboxParseStatus.IGNORED) return InboxProcessingStatus.DISMISSED;
    if (exactJournalId) return InboxProcessingStatus.IMPORTED;
    if (processedIds.has(parsed.id || '')) return InboxProcessingStatus.IMPORTED;
    if (duplicate && duplicate.score >= DUPLICATE_CONFIG.scoreThreshold) {
      return InboxProcessingStatus.DUPLICATE_FLAGGED;
    }
    return InboxProcessingStatus.PENDING;
  }

  async scanInbox(workplaceId: WorkplaceId, limit: number): Promise<number> {
    const start = Date.now();
    const messages = await smsInboxBridge.getLatestMessages(limit);
    if (messages.length === 0) {
      return 0;
    }

    const activeRules = (
      await transactionAutoPostRuleRepository.findActiveByWorkplace(workplaceId)
    ).sort((a, b) => smsRuleEngine.getRulePriority(b) - smsRuleEngine.getRulePriority(a));

    const processedIds = new Set(this.getProcessedSmsIds());
    const existing = await this.inbox
      .query(
        Q.where('channel', 'sms'),
        Q.where('device_source_id', Q.oneOf(messages.map(message => message.id))),
      )
      .fetch();
    const existingMap = new Map(existing.map(record => [record.deviceSourceId, record]));

    const parsedMessages = await Promise.all(
      messages.map(async msg => {
        const parsed = await SmsParser.parse(msg);
        const fingerprint = this.computeSmsFingerprint(msg.address, msg.body, msg.date);
        return { message: msg, parsed, fingerprint };
      }),
    );

    const messageIds = messages.map(m => m.id);
    const fingerprints = parsedMessages.map(m => m.fingerprint);

    const [journalsById, journalsByFingerprint] = await Promise.all([
      smsJournalQueries.findJournalsByOriginalSmsIds(messageIds, workplaceId),
      smsJournalQueries.findJournalsBySmsFingerprints(fingerprints, workplaceId),
    ]);

    const parsedWithAmounts = parsedMessages.filter(
      m => m.parsed.parseStatus === InboxParseStatus.PARSED && m.parsed.amount,
    );

    const allCandidateJournals = await this.findManyDuplicateCandidates(
      parsedWithAmounts,
      workplaceId,
    );

    // --- Phase 1: Parallel Async Analysis ---
    const candidateMessages = parsedMessages.filter(
      item => item.parsed.parseStatus !== InboxParseStatus.IGNORED,
    );

    const analysisResults: SmsAnalysisResult[] = await Promise.all(
      candidateMessages.map(async ({ message, parsed, fingerprint }) => {
        const existingRecord = existingMap.get(message.id) || null;
        const duplicate = allCandidateJournals.get(message.id) || null;
        const exactJournal = journalsById.get(message.id) || null;
        const fingerprintJournal = exactJournal
          ? null
          : journalsByFingerprint.get(fingerprint) || null;

        const nextStatus = this.resolveProcessingStatus({
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
          const ruleResult = await this.analyzeAutoPost(message, parsed, activeRules, workplaceId);
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
    const allOps: Model[] = [];
    const allAccountsToRebuild = new Set<AccountId>();

    if (analysisResults.length > 0) {
      for (const result of analysisResults) {
        let linkedJournalId = result.exactJournalId;

        if (result.autoPost) {
          const { journal, ops, accountsToRebuild } =
            ledgerWriteService.prepareCreateJournalFromPreparedData(
              result.autoPost.journalData,
              result.autoPost.preparedJournal,
              workplaceId,
            );

          allOps.push(...ops);
          accountsToRebuild.forEach(id => allAccountsToRebuild.add(id));
          linkedJournalId = journal.id;
          importedCount += 1;

          analytics.logSmsRuleTriggered(result.autoPost.ruleId, true);
          this.markSmsAsProcessed(result.message.id);
        }

        const { ops: upsertOps } = this.prepareUpsertInboxRecord(
          result.message,
          result.parsed,
          result.fingerprint,
          result.existingRecord,
          result.finalStatus,
          workplaceId,
          linkedJournalId,
          result.duplicate || undefined,
        );
        allOps.push(...upsertOps);
      }

      await database.write(async () => {
        await database.batch(allOps);
      });

      if (allAccountsToRebuild.size > 0) {
        const latestDate = Math.max(...messages.map(m => m.date));
        rebuildQueueService.enqueueMany(allAccountsToRebuild, latestDate, workplaceId);
      }
    }

    logger.info(`[Trace] SmsSyncPipeline.scanInbox: ${Date.now() - start}ms`, {
      scannedMessages: messages.length,
      importedCount,
      totalOps: allOps.length,
    });

    return importedCount;
  }

  private async findManyDuplicateCandidates(
    parsedItems: { message: SmsMessage; parsed: ParsedTransaction }[],
    workplaceId: WorkplaceId,
  ): Promise<Map<string, DuplicateMatch>> {
    if (parsedItems.length === 0) return new Map();

    const results = new Map<string, DuplicateMatch>();
    const amounts = Array.from(new Set(parsedItems.map(p => p.parsed.amount!)));
    const minDate =
      Math.min(...parsedItems.map(p => p.message.date)) - DUPLICATE_CONFIG.dayWindowMs;
    const maxDate =
      Math.max(...parsedItems.map(p => p.message.date)) + DUPLICATE_CONFIG.dayWindowMs;

    const journals = await smsJournalQueries.findNearbyJournals(
      {
        centerDate: (minDate + maxDate) / 2,
        windowMs: (maxDate - minDate) / 2,
        amounts,
        limit: 100,
      },
      workplaceId,
    );

    if (journals.length === 0) return results;

    for (const { message, parsed } of parsedItems) {
      const nearby = journals.filter(
        j =>
          Math.abs(j.journalDate - message.date) <= DUPLICATE_CONFIG.dayWindowMs &&
          j.totalAmount === parsed.amount,
      );

      if (nearby.length === 0) continue;

      let best: DuplicateMatch = null;
      for (const journal of nearby) {
        const reasons: string[] = ['Same amount'];
        let score = DUPLICATE_CONFIG.weightAmount;

        const timeDistance = Math.abs(journal.journalDate - message.date);
        const timeScore = Math.max(
          0,
          DUPLICATE_CONFIG.weightTime -
            (timeDistance / DUPLICATE_CONFIG.dayWindowMs) * DUPLICATE_CONFIG.weightTime,
        );
        score += timeScore;
        if (timeScore > DUPLICATE_CONFIG.weightTime / 2) reasons.push('Close in time');

        if (
          parsed.merchant &&
          journal.description &&
          journal.description.toLowerCase().includes(parsed.merchant.toLowerCase())
        ) {
          score += DUPLICATE_CONFIG.weightMerchant;
          reasons.push('Matching description/merchant');
        }

        if (!best || score > best.score) {
          best = { journalId: journal.id, score, reasons };
        }
      }

      if (best) {
        results.set(message.id, best);
      }
    }

    return results;
  }

  private async analyzeAutoPost(
    message: SmsMessage,
    parsed: ParsedTransaction,
    activeRules: TransactionAutoPostRule[],
    workplaceId: WorkplaceId,
  ): Promise<{
    disposition: 'auto_post' | 'review' | 'ignore';
    ruleId: string;
    createData?: {
      journalData: CreateJournalData;
      preparedJournal: PreparedJournalData;
    };
  } | null> {
    const matchData: SmsMatchData = {
      senderAddress: message.address,
      rawBody: message.body,
      parsedMerchant: parsed.merchant,
      parsedAccountSource: parsed.accountSource,
      direction: this.toDirection(parsed.type),
      parsedCurrencyCode: parsed.currencyCode,
      parsedAmount: parsed.amount,
    };

    for (const rule of activeRules) {
      const definition = smsRuleEngine.getRuleDefinition(rule);
      if (smsRuleEngine.matchesResolvedRule(matchData, definition)) {
        if (definition.actions.disposition === 'ignore') {
          return { disposition: 'ignore', ruleId: rule.id };
        }

        if (definition.actions.disposition === 'review') {
          return { disposition: 'review', ruleId: rule.id };
        }

        const sourceAccountId = definition.actions.sourceAccountId;
        const categoryAccountId = definition.actions.categoryAccountId;

        if (sourceAccountId && categoryAccountId && parsed.amount) {
          const isExpense = parsed.type === 'debit';
          const journalData: CreateJournalData = {
            journalDate: message.date,
            description: parsed.merchant
              ? `${parsed.merchant}`
              : isExpense
                ? `Expense via ${message.address}`
                : `Income via ${message.address}`,
            notes: `Auto-posted from SMS rule: ${rule.senderMatch || 'Rule'}`,
            currencyCode: parsed.currencyCode || AppConfig.defaultCurrency,
            status: JournalStatus.POSTED,
            metadata: {
              importSource: 'sms',
              originalSmsId: message.id,
              originalSmsSender: message.address,
              originalSmsBody: message.body,
              metadataJson: JSON.stringify({
                smsFingerprint: this.computeSmsFingerprint(
                  message.address,
                  message.body,
                  message.date,
                ),
              }),
            },
            transactions: [
              {
                accountId: sourceAccountId,
                amount: parsed.amount,
                transactionType: isExpense ? TransactionType.CREDIT : TransactionType.DEBIT,
              },
              {
                accountId: categoryAccountId,
                amount: parsed.amount,
                transactionType: isExpense ? TransactionType.DEBIT : TransactionType.CREDIT,
              },
            ],
          };

          try {
            const preparedJournal = await prepareJournalData(journalData, workplaceId);
            return {
              disposition: 'auto_post',
              ruleId: rule.id,
              createData: { journalData, preparedJournal },
            };
          } catch (e) {
            logger.warn(`Failed to prepare journal data for auto-post rule ${rule.id}`, {
              error: e,
            });
            return { disposition: 'review', ruleId: rule.id };
          }
        }
      }
    }

    return null;
  }

  prepareUpsertInboxRecord(
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
    const payload = {
      workplaceId,
      channel: 'sms' as const,
      deviceSourceId: sms.id,
      senderAddress: sms.address,
      rawBody: sms.body,
      inputDate: sms.date,
      fingerprint,
      parseStatus: parsed.parseStatus,
      rawPayloadJson: JSON.stringify(sms),
      parsedAmount: parsed.amount,
      parsedCurrencyCode: parsed.currencyCode,
      parsedMerchant: parsed.merchant,
      parsedAccountSource: parsed.accountSource,
      direction: this.toDirection(parsed.type),
      processingStatus,
      linkedJournalId,
      duplicateJournalId: duplicate?.journalId,
      duplicateScore: duplicate?.score,
      duplicateReason: duplicate ? duplicate.reasons.join(', ') : undefined,
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
      targetRecord = this.inbox.prepareCreate(record => {
        Object.assign(record, payload);
      });
      ops.push(targetRecord);
    }

    return { ops, record: targetRecord };
  }
}

export const smsSyncPipeline = new SmsSyncPipeline();
