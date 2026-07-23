import ExpoSmsInboxModule, { SmsMessage } from '@/modules/expo-sms-inbox';
import { AppConfig } from '@/src/constants';
import { database } from '@/src/data/database/Database';
import { AccountType } from '@/src/data/models/Account';
import { JournalStatus } from '@/src/data/models/Journal';
import TransactionAutoPostRule from '@/src/data/models/TransactionAutoPostRule';
import TransactionInboxRecord, {
  InboxParseStatus,
  InboxProcessingStatus,
  TransactionDirection,
} from '@/src/data/models/TransactionInboxRecord';
import Transaction, { TransactionType } from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { CreateJournalData, journalRepository } from '@/src/data/repositories/JournalRepository';
import { analytics } from '@/src/services/analytics-service';
import { ledgerWriteService } from '@/src/services/ledger';
import { PreparedJournalData, prepareJournalData } from '@/src/services/ledger/prepareJournalData';
import { workplaceService } from '@/src/services/WorkplaceService';
import { AccountId, JournalId, WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { executeBoundedBatchWrite } from '@/src/utils/dbGuardrails';
import { PermissionError } from '@/src/utils/errors';
import { safeParseJSON } from '@/src/utils/serialization';
import { storage } from '@/src/utils/storage';
import { Model, Q } from '@nozbe/watermelondb';
import { PermissionsAndroid, Platform } from 'react-native';
import { Observable } from 'rxjs';
import { rebuildQueueService } from './RebuildQueueService';
import { SmsParser, ParsedTransaction } from '@/src/services/ledger/SmsParser';
import {
  transactionAutoPostRuleRepository,
  SmsRuleDraftInput,
} from '@/src/data/repositories/TransactionAutoPostRuleRepository';
import {
  RuleMatcher,
  SmsMatchData,
  SmsRuleMode,
  SmsRuleDisposition,
  SmsRuleField,
  SmsRuleStringOperator,
  SmsRuleAmountOperator,
  SmsRuleCondition,
  SmsRuleActions,
  ResolvedSmsRule,
} from './ledger/RuleMatcher';

export {
  RuleMatcher,
  SmsMatchData,
  SmsRuleMode,
  SmsRuleDisposition,
  SmsRuleField,
  SmsRuleStringOperator,
  SmsRuleAmountOperator,
  SmsRuleCondition,
  SmsRuleActions,
  ResolvedSmsRule,
  ParsedTransaction,
};

const SMS_CONFIG = AppConfig.input.sms;
const DUPLICATE_CONFIG = SMS_CONFIG.duplicateDetection;

export interface SmsInboxFilterOptions {
  status?: 'pending' | 'processed' | 'auto_posted' | 'duplicates' | 'failed';
}

export interface SmsSyncResult {
  cursor: number;
  importedCount: number;
}

export interface SmsRuleSuggestion {
  senderMatch: string;
  bodyMatch?: string;
  sourceAccountId: AccountId;
  categoryAccountId: AccountId;
  sourceAccountName: string;
  categoryAccountName: string;
  sampleCount: number;
  sampleMerchants: string[];
}

export interface SmsRulePreviewInput {
  mode: SmsRuleMode;
  senderMatch?: string;
  bodyMatch?: string;
  conditions?: SmsRuleCondition[];
}

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

class SmsService {
  private readonly PROCESSED_SMS_KEY = '@processed_sms_ids';

  private get inbox() {
    return database.collections.get<TransactionInboxRecord>('transaction_inbox_records');
  }

  async getLatestMessages(
    limit: number = AppConfig.pagination.smsImportScanLimit,
  ): Promise<SmsMessage[]> {
    if (Platform.OS !== 'android') {
      throw new Error('Reading SMS is only supported on Android.');
    }

    const hasPermission = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
    if (!hasPermission) {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS, {
        title: 'SMS Permission',
        message:
          'Full Frills Balance needs access to read your SMS to import transactions securely.',
        buttonNeutral: 'Ask Me Later',
        buttonNegative: AppConfig.strings.common.cancel,
        buttonPositive: 'OK',
      });

      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        throw new PermissionError('READ_SMS permission denied by user.');
      }
    }

    if (!ExpoSmsInboxModule) {
      throw new Error('ExpoSmsInbox module is not available');
    }

    return ExpoSmsInboxModule.getSmsInbox(limit);
  }

  async scanRecentSmsPage(
    workplaceId: WorkplaceId,
    pageSize: number = AppConfig.pagination.smsImportScanLimit,
  ): Promise<SmsSyncResult> {
    const importedCount = await this.scanInbox(workplaceId, pageSize);
    return { cursor: pageSize, importedCount };
  }

  async scanOlderSmsPage(
    cursor: number,
    workplaceId: WorkplaceId,
    pageSize: number = AppConfig.pagination.smsImportScanLimit,
  ): Promise<SmsSyncResult> {
    const nextCursor = cursor + pageSize;
    const importedCount = await this.scanInbox(workplaceId, nextCursor);
    return { cursor: nextCursor, importedCount };
  }

  async refreshLatestSms(
    workplaceId: WorkplaceId,
    pageSize: number = AppConfig.pagination.smsImportScanLimit,
  ): Promise<SmsSyncResult> {
    const importedCount = await this.scanInbox(workplaceId, pageSize);
    return { cursor: pageSize, importedCount };
  }

  async processUnprocessedSms(workplaceId: WorkplaceId): Promise<number> {
    return this.scanInbox(workplaceId, AppConfig.pagination.smsImportScanLimit);
  }

  observeInbox(workplaceId: WorkplaceId, limit: number, filter?: SmsInboxFilterOptions) {
    const clauses: Q.Clause[] = [
      Q.where('workplace_id', workplaceId),
      Q.where('channel', 'sms'),
      Q.sortBy('input_date', Q.desc),
      Q.take(limit),
    ];
    const statuses = this.getProcessingStatusesForFilter(filter?.status);
    if (statuses.length > 0) {
      clauses.unshift(Q.where('processing_status', Q.oneOf(statuses)));
    }

    return this.inbox
      .query(...clauses)
      .observeWithColumns([
        'processing_status',
        'parse_status',
        'parsed_amount',
        'parsed_currency_code',
        'parsed_merchant',
        'linked_journal_id',
        'duplicate_journal_id',
        'duplicate_confidence',
        'parse_confidence',
        'parse_reason',
        'processed_at',
        'input_date',
      ]);
  }

  observeUnprocessedCount(workplaceId: WorkplaceId): Observable<number> {
    return this.inbox
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('channel', 'sms'),
        Q.where('processing_status', InboxProcessingStatus.PENDING),
      )
      .observeCount();
  }

  async getInboxRecord(id: string): Promise<TransactionInboxRecord | null> {
    try {
      return await this.inbox.find(id);
    } catch {
      return null;
    }
  }

  async findByLinkedJournalId(journalId: string): Promise<TransactionInboxRecord | null> {
    const records = await this.inbox
      .query(Q.where('linked_journal_id', journalId), Q.take(1))
      .fetch();
    return records[0] || null;
  }

  async markInboxRecordStatus(id: string, status: InboxProcessingStatus): Promise<void> {
    const record = await this.getInboxRecord(id);
    if (!record) return;

    await database.write(async () => {
      await record.update(entry => {
        entry.processingStatus = status;
        entry.processedAt = this.isProcessedStatus(status) ? Date.now() : undefined;
      });
    });
  }

  async linkSmsToJournal(
    recordId: string,
    journalId: JournalId,
    disposition: InboxProcessingStatus.IMPORTED | InboxProcessingStatus.AUTO_POSTED,
  ): Promise<void> {
    const record = await this.getInboxRecord(recordId);
    if (!record) return;

    await database.write(async () => {
      await record.update(entry => {
        entry.linkedJournalId = journalId;
        entry.processingStatus = disposition;
        entry.processedAt = Date.now();
      });
    });
  }

  async finalizeManualImport(recordId: string, journalId: JournalId): Promise<void> {
    await this.linkSmsToJournal(recordId, journalId, InboxProcessingStatus.IMPORTED);
  }

  clearProcessedMessages(): void {
    storage.remove(this.PROCESSED_SMS_KEY);
  }

  async previewRuleMatches(
    inputOrSender: SmsRulePreviewInput | string,
    bodyMatch?: string,
  ): Promise<TransactionInboxRecord[]> {
    const previewInput: SmsRulePreviewInput =
      typeof inputOrSender === 'string'
        ? { mode: 'regex', senderMatch: inputOrSender, bodyMatch }
        : inputOrSender;

    const items = await this.inbox
      .query(Q.where('channel', 'sms'), Q.sortBy('input_date', Q.desc), Q.take(50))
      .fetch();
    return items.filter(item => this.matchesPreviewRule(item, previewInput)).slice(0, 5);
  }

  async getRuleSuggestions(workplaceId: WorkplaceId): Promise<SmsRuleSuggestion[]> {
    const existingRules = await transactionAutoPostRuleRepository.findAllByWorkplace(workplaceId);
    const records = await this.inbox
      .query(
        Q.where('channel', 'sms'),
        Q.where('linked_journal_id', Q.notEq(null)),
        Q.where(
          'processing_status',
          Q.oneOf([InboxProcessingStatus.IMPORTED, InboxProcessingStatus.AUTO_POSTED]),
        ),
        Q.sortBy('input_date', Q.desc),
        Q.take(200),
      )
      .fetch();

    const grouped = new Map<
      string,
      {
        senderAddress: string;
        merchant?: string;
        accountSource?: string;
        journalIds: JournalId[];
        count: number;
      }
    >();

    for (const record of records) {
      if (!record.senderAddress) continue;
      const key = `${record.senderAddress.toUpperCase()}::${(record.parsedMerchant || '').toUpperCase()}`;
      const current = grouped.get(key);
      if (current) {
        current.count += 1;
        if (record.linkedJournalId) current.journalIds.push(record.linkedJournalId);
      } else {
        grouped.set(key, {
          senderAddress: record.senderAddress,
          merchant: record.parsedMerchant || undefined,
          accountSource: record.parsedAccountSource || undefined,
          journalIds: record.linkedJournalId ? [record.linkedJournalId] : [],
          count: 1,
        });
      }
    }

    const suggestions: SmsRuleSuggestion[] = [];
    for (const group of grouped.values()) {
      if (group.count < 2 || group.journalIds.length < 2) continue;
      const suggestion = await this.buildSuggestionFromHistory(group, workplaceId);
      if (!suggestion) continue;

      const alreadyExists = existingRules.some(
        rule =>
          rule.senderMatch === suggestion.senderMatch &&
          (rule.bodyMatch || '') === (suggestion.bodyMatch || '') &&
          rule.sourceAccountId === suggestion.sourceAccountId &&
          rule.categoryAccountId === suggestion.categoryAccountId,
      );
      if (!alreadyExists) {
        suggestions.push(suggestion);
      }
    }

    return suggestions.sort((a, b) => b.sampleCount - a.sampleCount).slice(0, 5);
  }

  async parseTransactionMessageAsync(sms: SmsMessage): Promise<ParsedTransaction> {
    return SmsParser.parse(sms);
  }

  async saveAutoPostRule(data: SmsRuleDraftInput, workplaceId: WorkplaceId) {
    await transactionAutoPostRuleRepository.save(data, workplaceId);
  }

  async deleteAutoPostRule(id: string) {
    await transactionAutoPostRuleRepository.delete(id);
  }

  async getMatchingRule(
    address: string,
    body: string,
    parsed: ParsedTransaction,
    workplaceId: WorkplaceId,
  ): Promise<TransactionAutoPostRule | null> {
    const activeRules = (
      await transactionAutoPostRuleRepository.findActiveByWorkplace(workplaceId)
    ).sort((a, b) => this.getRulePriority(b) - this.getRulePriority(a));

    const matchData: SmsMatchData = {
      senderAddress: address,
      rawBody: body,
      parsedMerchant: parsed.merchant,
      parsedAccountSource: parsed.accountSource,
      direction: this.toDirection(parsed.type),
      parsedCurrencyCode: parsed.currencyCode,
      parsedAmount: parsed.amount,
    };

    for (const rule of activeRules) {
      const definition = this.getRuleDefinition(rule);
      if (this.matchesResolvedRule(matchData, definition)) {
        return rule;
      }
    }

    return null;
  }

  private async scanInbox(workplaceId: WorkplaceId, limit: number): Promise<number> {
    const start = Date.now();
    const messages = await this.getLatestMessages(limit);
    if (messages.length === 0) {
      return 0;
    }

    const activeRules = (
      await transactionAutoPostRuleRepository.findActiveByWorkplace(workplaceId)
    ).sort((a, b) => this.getRulePriority(b) - this.getRulePriority(a));

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
        const parsed = await this.parseTransactionMessageAsync(msg);
        const fingerprint = this.computeSmsFingerprint(msg.address, msg.body, msg.date);
        return { message: msg, parsed, fingerprint };
      }),
    );

    const messageIds = messages.map(m => m.id);
    const fingerprints = parsedMessages.map(m => m.fingerprint);

    const [journalsById, journalsByFingerprint] = await Promise.all([
      journalRepository.findJournalsByOriginalSmsIds(messageIds, workplaceId),
      journalRepository.findJournalsBySmsFingerprints(fingerprints, workplaceId),
    ]);

    const parsedWithAmounts = parsedMessages.filter(
      m => m.parsed.parseStatus === InboxParseStatus.PARSED && m.parsed.amount,
    );

    const allCandidateJournals = await this.findManyDuplicateCandidates(
      parsedWithAmounts,
      workplaceId,
    );

    // --- Phase 1: Async Analysis ---
    const analysisResults: SmsAnalysisResult[] = [];

    for (const { message, parsed, fingerprint } of parsedMessages) {
      if (parsed.parseStatus === InboxParseStatus.IGNORED) {
        continue;
      }

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
      let finalJournalId = exactJournal?.id || fingerprintJournal?.id || undefined;

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

      analysisResults.push({
        message,
        parsed,
        fingerprint,
        existingRecord,
        duplicate,
        exactJournalId: finalJournalId,
        finalStatus,
        autoPost,
      });
    }

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

      await executeBoundedBatchWrite(database, allOps, SMS_CONFIG.batchOpChunkSize);

      if (allAccountsToRebuild.size > 0) {
        const latestDate = Math.max(...messages.map(m => m.date));
        rebuildQueueService.enqueueMany(allAccountsToRebuild, latestDate, workplaceId);
      }
    }

    logger.info(`[Trace] SmsService.scanInbox: ${Date.now() - start}ms`, {
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

    const journals = await journalRepository.findNearbyJournals(
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

        const description = (journal.description || '').toLowerCase();
        if (parsed.merchant && description.includes(parsed.merchant.toLowerCase())) {
          score += DUPLICATE_CONFIG.weightMerchant;
          reasons.push('Merchant matches description');
        }

        if (!best || score > best.score) {
          best = { journalId: journal.id, score, reasons };
        }
      }

      if (best && best.score >= DUPLICATE_CONFIG.scoreThreshold) {
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
    disposition: SmsRuleDisposition;
    ruleId: string;
    createData?: {
      journalData: CreateJournalData;
      preparedJournal: PreparedJournalData;
    };
  } | null> {
    if (activeRules.length === 0 || !parsed.amount) return null;

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
      const definition = this.getRuleDefinition(rule);
      if (!this.matchesResolvedRule(matchData, definition)) {
        continue;
      }

      if (definition.actions.disposition === 'ignore') {
        return { disposition: 'ignore', ruleId: rule.id };
      }

      if (definition.actions.disposition === 'review') {
        return { disposition: 'review', ruleId: rule.id };
      }

      if (!definition.actions.sourceAccountId || !definition.actions.categoryAccountId) {
        return { disposition: 'review', ruleId: rule.id };
      }

      const currencyCode = await workplaceService.getCurrency(workplaceId);
      const isExpense = parsed.type === 'debit';

      const customDesc = definition.actions.journalDescription?.trim();
      let resolvedDescription = 'Auto-Posted SMS Transaction';
      if (customDesc) {
        resolvedDescription = customDesc
          .replace(/{merchant}/gi, parsed.merchant || 'Unknown Merchant')
          .replace(/{amount}/gi, parsed.amount != null ? String(parsed.amount) : '0.00')
          .replace(/{ref}/gi, parsed.referenceNumber || '')
          .replace(/{sender}/gi, parsed.address || '');
      } else if (parsed.merchant) {
        resolvedDescription = `Auto-Posted: ${parsed.merchant}`;
      }

      const journalData: CreateJournalData = {
        journalDate: parsed.date || Date.now(),
        description: resolvedDescription,
        currencyCode,
        status: JournalStatus.POSTED,
        metadata: {
          importSource: 'sms',
          originalSmsId: parsed.id,
          originalSmsSender: parsed.address,
          originalSmsBody: parsed.rawBody,
          metadataJson: JSON.stringify({
            smsFingerprint: this.computeSmsFingerprint(message.address, message.body, message.date),
            parsedAmount: parsed.amount,
            parsedCurrencyCode: parsed.currencyCode || null,
            parsedMerchant: parsed.merchant || null,
            referenceNumber: parsed.referenceNumber || null,
            accountSource: parsed.accountSource || null,
          }),
        },
        transactions: [
          {
            accountId: definition.actions.sourceAccountId as AccountId,
            amount: parsed.amount,
            transactionType: isExpense ? TransactionType.CREDIT : TransactionType.DEBIT,
            currencyCode,
          },
          {
            accountId: definition.actions.categoryAccountId as AccountId,
            amount: parsed.amount,
            transactionType: isExpense ? TransactionType.DEBIT : TransactionType.CREDIT,
            currencyCode,
          },
        ],
      };

      const preparedJournal = await prepareJournalData(journalData, workplaceId);

      return {
        disposition: 'auto_post',
        ruleId: rule.id,
        createData: {
          journalData,
          preparedJournal,
        },
      };
    }

    return null;
  }

  private prepareUpsertInboxRecord(
    sms: SmsMessage,
    parsed: ParsedTransaction,
    smsFingerprint: string,
    existing: TransactionInboxRecord | null,
    processingStatus: InboxProcessingStatus,
    workplaceId: WorkplaceId,
    linkedJournalId?: JournalId,
    duplicate?: DuplicateMatch,
  ): { record: TransactionInboxRecord; ops: Model[] } {
    const now = Date.now();
    const metadataJson = JSON.stringify({
      duplicateReasons: duplicate?.reasons || [],
      smsFingerprint,
      parsedAmount: parsed.amount ?? null,
      parsedCurrencyCode: parsed.currencyCode ?? null,
      parsedMerchant: parsed.merchant ?? null,
      referenceNumber: parsed.referenceNumber ?? null,
      parsedAccountSource: parsed.accountSource ?? null,
    });

    if (existing) {
      const op = existing.prepareUpdate(entry => {
        entry.senderAddress = sms.address;
        entry.rawBody = sms.body;
        entry.inputDate = sms.date;
        entry.inputFingerprint = smsFingerprint;
        entry.parseStatus = parsed.parseStatus;
        entry.parsedAmount = parsed.amount;
        entry.parsedCurrencyCode = parsed.currencyCode;
        entry.parsedMerchant = parsed.merchant;
        entry.parsedAccountSource = parsed.accountSource;
        entry.referenceNumber = parsed.referenceNumber;
        entry.direction = this.toDirection(parsed.type);
        entry.processingStatus = processingStatus;
        entry.linkedJournalId = linkedJournalId || existing.linkedJournalId;
        entry.duplicateJournalId = duplicate?.journalId;
        entry.duplicateConfidence = duplicate?.score;
        entry.parseConfidence = parsed.confidence;
        entry.parseReason = parsed.parseReason;
        entry.metadataJson = metadataJson;
        entry.workplaceId = workplaceId;
        entry.lastScannedAt = now;
        entry.processedAt = this.isProcessedStatus(processingStatus) ? now : existing.processedAt;
      });
      return { record: existing, ops: [op] };
    }

    const created = this.inbox.prepareCreate(entry => {
      entry.channel = 'sms';
      entry.workplaceId = workplaceId;
      entry.deviceSourceId = sms.id;
      entry.senderAddress = sms.address;
      entry.rawBody = sms.body;
      entry.inputDate = sms.date;
      entry.inputFingerprint = smsFingerprint;
      entry.parseStatus = parsed.parseStatus;
      entry.parsedAmount = parsed.amount;
      entry.parsedCurrencyCode = parsed.currencyCode;
      entry.parsedMerchant = parsed.merchant;
      entry.parsedAccountSource = parsed.accountSource;
      entry.referenceNumber = parsed.referenceNumber;
      entry.direction = this.toDirection(parsed.type);
      entry.processingStatus = processingStatus;
      entry.linkedJournalId = linkedJournalId;
      entry.duplicateJournalId = duplicate?.journalId;
      entry.duplicateConfidence = duplicate?.score;
      entry.parseConfidence = parsed.confidence;
      entry.parseReason = parsed.parseReason;
      entry.metadataJson = metadataJson;
      entry.firstSeenAt = now;
      entry.lastScannedAt = now;
      entry.processedAt = this.isProcessedStatus(processingStatus) ? now : undefined;
    });

    return { record: created, ops: [created] };
  }

  private toDirection(type: 'debit' | 'credit' | 'unknown'): TransactionDirection {
    if (type === 'debit') return TransactionDirection.DEBIT;
    if (type === 'credit') return TransactionDirection.CREDIT;
    return TransactionDirection.UNKNOWN;
  }

  private resolveProcessingStatus(params: {
    parsed: ParsedTransaction;
    processedIds: Set<string>;
    exactJournalId?: string;
    duplicate: DuplicateMatch;
    existingStatus?: InboxProcessingStatus;
  }): InboxProcessingStatus {
    const { parsed, processedIds, exactJournalId, duplicate, existingStatus } = params;

    if (exactJournalId) return InboxProcessingStatus.IMPORTED;
    if (parsed.parseStatus === InboxParseStatus.PARSE_FAILED)
      return InboxProcessingStatus.PARSE_FAILED;
    if (
      existingStatus === InboxProcessingStatus.AUTO_POSTED ||
      existingStatus === InboxProcessingStatus.IMPORTED
    ) {
      return existingStatus;
    }
    if (duplicate) return InboxProcessingStatus.DUPLICATE_FLAGGED;
    if (processedIds.has(parsed.id)) return InboxProcessingStatus.DISMISSED;
    return InboxProcessingStatus.PENDING;
  }

  private getProcessingStatusesForFilter(
    filter?: SmsInboxFilterOptions['status'],
  ): InboxProcessingStatus[] {
    switch (filter) {
      case 'pending':
        return [InboxProcessingStatus.PENDING];
      case 'processed':
        return [
          InboxProcessingStatus.IMPORTED,
          InboxProcessingStatus.AUTO_POSTED,
          InboxProcessingStatus.DISMISSED,
        ];
      case 'auto_posted':
        return [InboxProcessingStatus.AUTO_POSTED];
      case 'duplicates':
        return [InboxProcessingStatus.DUPLICATE_FLAGGED];
      case 'failed':
        return [InboxProcessingStatus.PARSE_FAILED];
      default:
        return [];
    }
  }

  private isProcessedStatus(status: InboxProcessingStatus): boolean {
    return [
      InboxProcessingStatus.IMPORTED,
      InboxProcessingStatus.AUTO_POSTED,
      InboxProcessingStatus.DISMISSED,
    ].includes(status);
  }

  private matchesPreviewRule(data: TransactionInboxRecord, input: SmsRulePreviewInput): boolean {
    const parsedRule: ResolvedSmsRule = {
      mode: input.mode,
      senderMatch: input.senderMatch,
      bodyMatch: input.bodyMatch,
      conditions: (input.conditions || []).filter(condition =>
        this.isMeaningfulCondition(condition),
      ),
      actions: { disposition: 'review' },
      priority: 100,
    };
    const matchData: SmsMatchData = {
      senderAddress: data.senderAddress || '',
      rawBody: data.rawBody || '',
      parsedMerchant: data.parsedMerchant || undefined,
      parsedAccountSource: data.parsedAccountSource || undefined,
      direction: data.direction,
      parsedCurrencyCode: data.parsedCurrencyCode || undefined,
      parsedAmount: data.parsedAmount || undefined,
    };
    return RuleMatcher.compileRule(parsedRule)(matchData);
  }

  private getRulePriority(rule: TransactionAutoPostRule): number {
    return typeof rule.priority === 'number' ? rule.priority : 100;
  }

  private getRuleDefinition(rule: TransactionAutoPostRule): ResolvedSmsRule {
    let conditions: SmsRuleCondition[] = [];
    let actions: SmsRuleActions = {
      disposition: 'auto_post',
      sourceAccountId: rule.sourceAccountId || undefined,
      categoryAccountId: rule.categoryAccountId || undefined,
    };
    let mode: SmsRuleMode = 'regex';

    if (rule.conditionsJson) {
      const parsed = safeParseJSON<any[]>(rule.conditionsJson, []);
      if (Array.isArray(parsed)) {
        conditions = parsed.filter(condition => this.isMeaningfulCondition(condition));
        if (conditions.length > 0) {
          mode = 'builder';
        }
      }
    }

    if (rule.actionsJson) {
      const parsed = safeParseJSON<any>(rule.actionsJson, {});
      if (parsed && typeof parsed === 'object') {
        actions = {
          disposition:
            parsed.disposition === 'ignore' || parsed.disposition === 'review'
              ? parsed.disposition
              : 'auto_post',
          sourceAccountId: parsed.sourceAccountId || actions.sourceAccountId,
          categoryAccountId: parsed.categoryAccountId || actions.categoryAccountId,
        };
      }
    }

    return {
      mode,
      senderMatch: rule.senderMatch || undefined,
      bodyMatch: rule.bodyMatch || undefined,
      conditions,
      actions,
      priority: this.getRulePriority(rule),
    };
  }

  private matchesResolvedRule(data: SmsMatchData, definition: ResolvedSmsRule): boolean {
    return RuleMatcher.compileRule(definition)(data);
  }

  private isMeaningfulCondition(
    condition: Partial<SmsRuleCondition> | null | undefined,
  ): condition is SmsRuleCondition {
    if (!condition?.field || !condition.operator) return false;
    if (condition.field === 'amount') {
      if (condition.operator === 'between') {
        return typeof condition.minValue === 'number' && typeof condition.maxValue === 'number';
      }
      return typeof condition.minValue === 'number';
    }
    return !!condition.value?.trim();
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

  private computeSmsFingerprint(sender: string, body: string, date: number): string {
    const normalizedSender = sender.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedBody = body
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^a-z0-9 ]/g, '')
      .trim();
    const dateBucket = Math.floor(date / DUPLICATE_CONFIG.dayWindowMs);
    return `${normalizedSender}::${normalizedBody.slice(0, 160)}::${dateBucket}`;
  }

  private async buildSuggestionFromHistory(
    group: {
      senderAddress: string;
      merchant?: string;
      accountSource?: string;
      journalIds: JournalId[];
      count: number;
    },
    workplaceId: WorkplaceId,
  ): Promise<SmsRuleSuggestion | null> {
    const journals = await journalRepository.findByIds(workplaceId, group.journalIds.slice(0, 10));
    const accountIds = new Set<AccountId>();
    const journalTransactions = new Map<JournalId, Transaction[]>();

    for (const journal of journals) {
      const transactions = await database.collections
        .get<Transaction>('transactions')
        .query(Q.where('journal_id', journal.id), Q.where('deleted_at', Q.eq(null)))
        .fetch();
      journalTransactions.set(journal.id, transactions);
      transactions.forEach((tx: Transaction) => accountIds.add(tx.accountId));
    }

    const accounts = await accountRepository.findAllByIds(workplaceId, Array.from(accountIds));
    const accountMap = new Map(accounts.map(account => [account.id, account]));
    const sourceCounts = new Map<AccountId, number>();
    const categoryCounts = new Map<AccountId, number>();

    for (const journal of journals) {
      const transactions = journalTransactions.get(journal.id) || [];
      for (const tx of transactions) {
        const account = accountMap.get(tx.accountId);
        if (!account) continue;
        if (
          [AccountType.ASSET, AccountType.LIABILITY].includes(account.accountType as AccountType)
        ) {
          sourceCounts.set(
            account.id as AccountId,
            (sourceCounts.get(account.id as AccountId) || 0) + 1,
          );
        } else if (
          [AccountType.EXPENSE, AccountType.INCOME].includes(account.accountType as AccountType)
        ) {
          categoryCounts.set(
            account.id as AccountId,
            (categoryCounts.get(account.id as AccountId) || 0) + 1,
          );
        }
      }
    }

    const sourceAccountId = Array.from(sourceCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
    const categoryAccountId = Array.from(categoryCounts.entries()).sort(
      (a, b) => b[1] - a[1],
    )[0]?.[0];
    if (!sourceAccountId || !categoryAccountId) return null;

    const sourceAccount = accountMap.get(sourceAccountId);
    const categoryAccount = accountMap.get(categoryAccountId);
    if (!sourceAccount || !categoryAccount) return null;

    return {
      senderMatch: group.senderAddress.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      bodyMatch: group.merchant
        ? group.merchant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        : group.accountSource,
      sourceAccountId,
      categoryAccountId,
      sourceAccountName: sourceAccount.name,
      categoryAccountName: categoryAccount.name,
      sampleCount: group.count,
      sampleMerchants: group.merchant ? [group.merchant] : [],
    };
  }

  async prepareMergeOperations(
    workplaceId: WorkplaceId,
    sourceAccountIds: AccountId[],
    targetAccountId: AccountId,
  ): Promise<TransactionAutoPostRule[]> {
    return transactionAutoPostRuleRepository.prepareMergeOperations(
      workplaceId,
      sourceAccountIds,
      targetAccountId,
    );
  }
}

export const smsService = new SmsService();
