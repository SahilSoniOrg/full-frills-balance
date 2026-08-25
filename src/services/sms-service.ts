import { SmsMessage } from '@/modules/expo-sms-inbox';
import { AppConfig } from '@/src/constants';
import { database } from '@/src/data/database/Database';
import TransactionAutoPostRule, { toPlainSmsRule } from '@/src/data/models/TransactionAutoPostRule';
import TransactionInboxRecord, {
  toPlainInboxRecord,
} from '@/src/data/models/TransactionInboxRecord';
import { InboxProcessingStatus } from '@/src/types/enums';
import { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';
import { transactionInboxRepository } from '@/src/data/repositories/TransactionInboxRepository';
import { SmsRuleDraftInput } from '@/src/data/repositories/TransactionAutoPostRuleRepository';
import { ParsedTransaction, SmsParser } from '@/src/services/ledger/SmsParser';
import { smsInboxBridge } from '@/src/services/sms/SmsInboxBridge';
import {
  smsRuleEngine,
  SmsRulePreviewInput,
  SmsRuleSuggestion,
} from '@/src/services/sms/SmsRuleEngine';
import { smsSyncPipeline } from '@/src/services/sms/pipeline';
import { storage } from '@/src/utils/storage';
import { Q } from '@nozbe/watermelondb';
import { map, Observable } from 'rxjs';

export interface SmsInboxFilterOptions {
  status?: 'pending' | 'processed' | 'auto_posted' | 'duplicates' | 'failed';
}

export interface SmsSyncResult {
  cursor: number;
  importedCount: number;
}

/**
 * Inbox query / link Module. Scan, parse, and rules live on
 * SmsSyncPipeline / SmsParser / SmsRuleEngine — import those directly.
 */
class SmsService {
  private readonly PROCESSED_SMS_KEY = '@processed_sms_ids';

  private get inbox() {
    return database.collections.get<TransactionInboxRecord>('transaction_inbox_records');
  }

  async getLatestMessages(
    limit: number = AppConfig.pagination.smsImportScanLimit,
  ): Promise<SmsMessage[]> {
    return smsInboxBridge.getLatestMessages(limit);
  }

  async scanRecentSmsPage(
    workplaceId: WorkplaceId,
    pageSize: number = AppConfig.pagination.smsImportScanLimit,
  ): Promise<SmsSyncResult> {
    const importedCount = await smsSyncPipeline.scanInbox(workplaceId, pageSize);
    return { cursor: pageSize, importedCount };
  }

  async scanOlderSmsPage(
    cursor: number,
    workplaceId: WorkplaceId,
    pageSize: number = AppConfig.pagination.smsImportScanLimit,
  ): Promise<SmsSyncResult> {
    const nextCursor = cursor + pageSize;
    const importedCount = await smsSyncPipeline.scanInbox(workplaceId, nextCursor);
    return { cursor: nextCursor, importedCount };
  }

  async refreshLatestSms(
    workplaceId: WorkplaceId,
    pageSize: number = AppConfig.pagination.smsImportScanLimit,
  ): Promise<SmsSyncResult> {
    const importedCount = await smsSyncPipeline.scanInbox(workplaceId, pageSize);
    return { cursor: pageSize, importedCount };
  }

  async processUnprocessedSms(workplaceId: WorkplaceId, signal?: AbortSignal): Promise<number> {
    return smsSyncPipeline.scanInbox(workplaceId, AppConfig.pagination.smsImportScanLimit, signal);
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
      ])
      .pipe(map(records => records.map(toPlainInboxRecord)));
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

  async getInboxRecord(
    workplaceId: WorkplaceId,
    id: string,
  ): Promise<TransactionInboxRecord | null> {
    return transactionInboxRepository.find(workplaceId, id);
  }

  async findByLinkedJournalId(
    workplaceId: WorkplaceId,
    journalId: string,
  ): Promise<TransactionInboxRecord | null> {
    const records = await this.findAllByLinkedJournalId(workplaceId, journalId);
    return records[0] || null;
  }

  async findAllByLinkedJournalId(
    workplaceId: WorkplaceId,
    journalId: string,
  ): Promise<TransactionInboxRecord[]> {
    return this.inbox
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('linked_journal_id', journalId),
        Q.where('channel', 'sms'),
        Q.sortBy('input_date', Q.asc),
      )
      .fetch();
  }

  async markInboxRecordStatus(
    workplaceId: WorkplaceId,
    id: string,
    status: InboxProcessingStatus,
  ): Promise<void> {
    await transactionInboxRepository.persistStatus(workplaceId, id, status);
  }

  async linkSmsToJournal(
    workplaceId: WorkplaceId,
    recordId: string,
    journalId: JournalId,
    disposition: InboxProcessingStatus.IMPORTED | InboxProcessingStatus.AUTO_POSTED,
  ): Promise<void> {
    await transactionInboxRepository.persistLink(workplaceId, recordId, journalId, disposition);
  }

  async finalizeManualImport(
    workplaceId: WorkplaceId,
    recordId: string,
    journalId: JournalId,
  ): Promise<void> {
    await this.linkSmsToJournal(workplaceId, recordId, journalId, InboxProcessingStatus.IMPORTED);
  }

  clearProcessedMessages(): void {
    storage.remove(this.PROCESSED_SMS_KEY);
  }

  markSmsAsProcessed(smsId: string): void {
    smsSyncPipeline.markSmsAsProcessed(smsId);
  }

  async previewRuleMatches(
    workplaceId: WorkplaceId,
    inputOrSender: SmsRulePreviewInput | string,
    bodyMatch?: string,
  ) {
    const records = await smsRuleEngine.previewRuleMatches(workplaceId, inputOrSender, bodyMatch);
    return records.map(toPlainInboxRecord);
  }

  async getRuleSuggestions(workplaceId: WorkplaceId): Promise<SmsRuleSuggestion[]> {
    return smsRuleEngine.getRuleSuggestions(workplaceId);
  }

  async parseTransactionMessageAsync(sms: SmsMessage): Promise<ParsedTransaction> {
    return SmsParser.parse(sms);
  }

  async saveAutoPostRule(data: SmsRuleDraftInput, workplaceId: WorkplaceId) {
    return smsRuleEngine.saveAutoPostRule(data, workplaceId);
  }

  async deleteAutoPostRule(id: string, workplaceId: WorkplaceId) {
    return smsRuleEngine.deleteAutoPostRule(id, workplaceId);
  }

  async getMatchingRule(
    address: string,
    body: string,
    parsed: ParsedTransaction,
    workplaceId: WorkplaceId,
  ) {
    const rule = await smsRuleEngine.getMatchingRule(address, body, parsed, workplaceId);
    return rule ? toPlainSmsRule(rule) : null;
  }

  async prepareMergeOperations(
    workplaceId: WorkplaceId,
    sourceAccountIds: AccountId[],
    targetAccountId: AccountId,
  ): Promise<TransactionAutoPostRule[]> {
    return smsRuleEngine.prepareMergeOperations(workplaceId, sourceAccountIds, targetAccountId);
  }

  private getProcessingStatusesForFilter(statusFilter?: string): InboxProcessingStatus[] {
    switch (statusFilter) {
      case 'pending':
        return [InboxProcessingStatus.PENDING];
      case 'processed':
        return [InboxProcessingStatus.IMPORTED, InboxProcessingStatus.AUTO_POSTED];
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
}

export const smsService = new SmsService();
