import { SmsMessage } from '@/modules/expo-sms-inbox';
import { AppConfig } from '@/src/constants';
import { toPlainSmsRule } from '@/src/data/models/TransactionAutoPostRule';
import TransactionInboxRecord, {
  toPlainInboxRecord,
} from '@/src/data/models/TransactionInboxRecord';
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
import { map, Observable } from 'rxjs';

export type SmsInboxFilterStatus =
  'pending' | 'processed' | 'auto_posted' | 'duplicates' | 'failed';

export interface SmsInboxFilterOptions {
  status?: SmsInboxFilterStatus;
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

  async processUnprocessedSms(workplaceId: WorkplaceId, signal?: AbortSignal): Promise<number> {
    return smsSyncPipeline.scanInbox(workplaceId, AppConfig.pagination.smsImportScanLimit, signal);
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
  ): Promise<TransactionInboxRecord[]> {
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
