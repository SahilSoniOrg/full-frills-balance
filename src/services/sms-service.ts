import type { InboxRecordSnapshot, SmsInboxCursor } from '@/src/types/smsInbox';
import { smsInboxBridge } from '@/src/services/sms/SmsInboxBridge';
import { SmsMessage } from '@/modules/expo-sms-inbox';
import { AppConfig } from '@/src/constants';
import { toPlainSmsRule } from '@/src/data/models/TransactionAutoPostRule';
import { toPlainInboxRecord } from '@/src/data/models/TransactionInboxRecord';
import { InboxProcessingStatus } from '@/src/types/enums';
import { JournalId, WorkplaceId } from '@/src/types/ids';
import { transactionInboxRepository } from '@/src/data/repositories/TransactionInboxRepository';
import { SmsRuleDraftInput } from '@/src/data/repositories/TransactionAutoPostRuleRepository';
import { ParsedTransaction, SmsParser } from '@/src/services/ledger/SmsParser';
import {
  smsRuleEngine,
  SmsRulePreviewInput,
  SmsRuleSuggestion,
} from '@/src/services/sms/SmsRuleEngine';
import { smsSyncPipeline } from '@/src/services/sms/pipeline';
import { smsPrivacyService } from '@/src/services/sms/SmsPrivacyService';
import { map, Observable } from 'rxjs';

export type SmsInboxFilterStatus =
  'pending' | 'processed' | 'auto_posted' | 'duplicates' | 'failed';

export interface SmsInboxFilterOptions {
  status?: SmsInboxFilterStatus;
}

export interface SmsSyncResult {
  cursor: SmsInboxCursor | null;
  hasMore: boolean;
  importedCount: number;
}

class SmsService {
  async scanRecentSmsPage(
    workplaceId: WorkplaceId,
    pageSize: number = AppConfig.pagination.smsImportScanLimit,
  ): Promise<SmsSyncResult> {
    await smsPrivacyService.cleanupLegacyContent();
    const messages = await smsInboxBridge.getLatestMessages(pageSize);
    const importedCount = await smsSyncPipeline.scanMessages(workplaceId, messages);
    const last = messages[messages.length - 1];
    return {
      cursor: last ? { date: last.date, id: last.id } : null,
      importedCount,
      hasMore: messages.length === pageSize,
    };
  }

  async scanOlderSmsPage(
    cursor: SmsInboxCursor | null,
    workplaceId: WorkplaceId,
    pageSize: number = AppConfig.pagination.smsImportScanLimit,
  ): Promise<SmsSyncResult> {
    if (!cursor) return { cursor: null, importedCount: 0, hasMore: false };
    await smsPrivacyService.cleanupLegacyContent();
    const messages = await smsInboxBridge.getOlderMessages(cursor, pageSize);
    const importedCount = await smsSyncPipeline.scanMessages(workplaceId, messages);
    const last = messages[messages.length - 1];
    return {
      cursor: last ? { date: last.date, id: last.id } : cursor,
      importedCount,
      hasMore: messages.length === pageSize,
    };
  }

  async findInboxRecord(workplaceId: WorkplaceId, id: string) {
    const record = await transactionInboxRepository.find(workplaceId, id);
    return record ? toPlainInboxRecord(record) : null;
  }

  observeInbox(workplaceId: WorkplaceId, limit: number, filter?: SmsInboxFilterOptions) {
    return transactionInboxRepository
      .observeInbox(workplaceId, limit, this.getProcessingStatusesForFilter(filter?.status))
      .pipe(map(records => records.map(toPlainInboxRecord)));
  }

  observeUnprocessedCount(workplaceId: WorkplaceId): Observable<number> {
    return transactionInboxRepository.observePendingCount(workplaceId);
  }

  async findAllByLinkedJournalId(
    workplaceId: WorkplaceId,
    journalId: JournalId,
  ): Promise<InboxRecordSnapshot[]> {
    return transactionInboxRepository.findAllByLinkedJournalId(workplaceId, journalId);
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

  private getProcessingStatusesForFilter(
    statusFilter?: SmsInboxFilterStatus,
  ): InboxProcessingStatus[] {
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
