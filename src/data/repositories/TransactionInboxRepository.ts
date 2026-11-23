import { database } from '@/src/data/database/Database';
import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import { InboxProcessingStatus } from '@/src/types/enums';
import { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';
import type { AccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import { Model, Q } from '@nozbe/watermelondb';
import { Observable, combineLatest, filter, map, merge, startWith } from 'rxjs';
import {
  deviceSmsInboxRepository,
  type DeviceSmsWriteOptions,
} from './DeviceSmsInboxRepository';
import { workplaceRepository } from './WorkplaceRepository';
import type DeviceSmsInboxRecord from '@/src/data/models/DeviceSmsInboxRecord';
import type { InboxRecordSnapshot, TransactionInboxRecordWriteData } from '@/src/types/smsInbox';
import {
  findEmail as findEmailRecords,
  findEmailCopies as findEmailCopyRecords,
  findRecentPendingEmail as findRecentPendingEmailRecords,
  stageEmailInSession as stageEmailObservationInSession,
} from './transactionInbox/inboxEmail';
import {
  persistInboxLink,
  persistInboxStatus,
  persistInboxUnlink,
  prepareInboxLink,
  prepareInboxStatus,
  prepareInboxUnlink,
  prepareInboxUpsert,
  stageInboxLinkByIdInSession,
  stageInboxUpsertInSession,
  type InboxAuditContext,
} from './transactionInbox/inboxLinkSessionStaging';
import {
  findByDeviceSourceIds as findInboxByDeviceSourceIds,
  findInboxRecord,
  findLinksForJournals as findInboxLinksForJournals,
  findMatchingSms as findMatchingSmsRecord,
  inboxCollection,
  projectInbox,
} from './transactionInbox/inboxProjection';
import {
  findAllByLinkedJournalId as findSmsAllByLinkedJournalId,
  findLinkedProcessedSmsPage as findSmsLinkedProcessedPage,
  findPendingSmsPage as findSmsPendingPage,
  findRecentLinkedProcessed as findSmsRecentLinkedProcessed,
  findRecentLinkedToAccount as findSmsRecentLinkedToAccount,
  findRecentPendingSms as findSmsRecentPending,
  findRecentSms as findSmsRecent,
  repairParsedSmsMerchants as repairSmsParsedMerchants,
  type ParsedMerchantRepair,
} from './transactionInbox/inboxSmsPaging';

export type { ParsedMerchantRepair };

export class TransactionInboxRepository {
  /** Provider IDs are scoped to the source account and stored without message bodies. */
  async findEmailCopies(sourceId: string): Promise<InboxRecordSnapshot[]> {
    return findEmailCopyRecords(sourceId);
  }

  async findEmail(workplaceId: WorkplaceId, id: string): Promise<InboxRecordSnapshot | null> {
    return findEmailRecords(workplaceId, id);
  }

  async stageEmailInSession(
    session: AccountingWriteSession,
    data: TransactionInboxRecordWriteData,
    auditContext?: InboxAuditContext,
  ): Promise<void> {
    return stageEmailObservationInSession(session, data, auditContext);
  }

  async find(workplaceId: WorkplaceId, id: string): Promise<InboxRecordSnapshot | null> {
    return findInboxRecord(workplaceId, id);
  }

  async findByDeviceSourceIds(
    workplaceId: WorkplaceId,
    deviceSourceIds: string[],
  ): Promise<InboxRecordSnapshot[]> {
    return findInboxByDeviceSourceIds(workplaceId, deviceSourceIds);
  }

  async findMatchingSms(
    workplaceId: WorkplaceId,
    data: TransactionInboxRecordWriteData,
  ): Promise<InboxRecordSnapshot | null> {
    return findMatchingSmsRecord(workplaceId, data);
  }

  async findAllByLinkedJournalId(
    workplaceId: WorkplaceId,
    journalId: JournalId,
  ): Promise<InboxRecordSnapshot[]> {
    return findSmsAllByLinkedJournalId(workplaceId, journalId);
  }

  /** The database selects a bounded SMS page before any Account history is hydrated. */
  async findRecentLinkedToAccount(
    workplaceId: WorkplaceId,
    accountId: AccountId,
    limit: number,
  ): Promise<InboxRecordSnapshot[]> {
    return findSmsRecentLinkedToAccount(workplaceId, accountId, limit);
  }

  /** Invalidation signals only; subscribing never materializes the full SMS history. */
  observeMatcherDiscoveryEvidence(workplaceId: WorkplaceId): Observable<void> {
    return merge(
      inboxCollection().changes.pipe(
        filter(changes =>
          changes.some(
            ({ record }) => record.workplaceId === workplaceId && record.channel === 'sms',
          ),
        ),
      ),
      database.collections.get<DeviceSmsInboxRecord>('device_sms_inbox_records').changes,
    ).pipe(
      map(() => undefined),
      startWith(undefined),
    );
  }

  observeInbox(
    workplaceId: WorkplaceId,
    limit: number,
    statuses?: InboxProcessingStatus[],
  ): Observable<InboxRecordSnapshot[]> {
    return combineLatest([
      deviceSmsInboxRepository.observe(),
      inboxCollection()
        .query(
          Q.or(
            Q.where('channel', 'sms'),
            Q.and(
              Q.where('channel', Q.oneOf(['email', 'voice'])),
              Q.where('workplace_id', workplaceId),
            ),
          ),
        )
        .observeWithColumns([
          'processing_status',
          'linked_journal_id',
          'parsed_merchant',
          'duplicate_journal_id',
          'duplicate_confidence',
          'last_scanned_at',
        ]),
      workplaceRepository.observeAll(),
    ]).pipe(
      map(([devices, copies, workplaces]) =>
        projectInbox(
          workplaceId,
          devices,
          copies,
          new Map(workplaces.map(workplace => [workplace.id, workplace.name])),
        )
          .filter(record => !statuses?.length || statuses.includes(record.processingStatus))
          .slice(0, limit),
      ),
    );
  }

  observeConsumptionChanges() {
    return inboxCollection()
      .query(Q.where('channel', 'sms'))
      .observeWithColumns(['processing_status', 'linked_journal_id', 'last_scanned_at']);
  }

  observePendingCount(workplaceId: WorkplaceId): Observable<number> {
    return this.observeInbox(workplaceId, Number.MAX_SAFE_INTEGER, [
      InboxProcessingStatus.PENDING,
    ]).pipe(map(records => records.length));
  }

  async findRecentSms(workplaceId: WorkplaceId, limit: number): Promise<InboxRecordSnapshot[]> {
    return findSmsRecent(workplaceId, limit);
  }

  /** Workplace-scoped pending email observations for two-sided uniqueness checks. */
  async findRecentPendingEmail(
    workplaceId: WorkplaceId,
    limit: number,
  ): Promise<InboxRecordSnapshot[]> {
    return findRecentPendingEmailRecords(workplaceId, limit);
  }

  /** Inbox rows already linked to any of the given journals (any channel). */
  async findLinksForJournals(
    workplaceId: WorkplaceId,
    journalIds: JournalId[],
  ): Promise<{ journalId: JournalId; channel: string; reference?: string | null }[]> {
    return findInboxLinksForJournals(workplaceId, journalIds);
  }

  async findRecentPendingSms(
    workplaceId: WorkplaceId,
    limit: number,
  ): Promise<InboxRecordSnapshot[]> {
    return findSmsRecentPending(workplaceId, limit);
  }

  // This walks the device inbox by id and then keeps this workplace's pending rows,
  // because pending state lives on workplace review state rather than on the device row.
  async findPendingSmsPage(workplaceId: WorkplaceId, afterId: string | undefined, limit: number) {
    return findSmsPendingPage(workplaceId, afterId, limit);
  }

  async findRecentLinkedProcessed(
    workplaceId: WorkplaceId,
    limit: number,
  ): Promise<TransactionInboxRecord[]> {
    return findSmsRecentLinkedProcessed(workplaceId, limit);
  }

  async findLinkedProcessedSmsPage(
    workplaceId: WorkplaceId,
    afterId: string | undefined,
    limit: number,
  ): Promise<TransactionInboxRecord[]> {
    return findSmsLinkedProcessedPage(workplaceId, afterId, limit);
  }

  async repairParsedSmsMerchants(
    workplaceId: WorkplaceId,
    repairs: readonly ParsedMerchantRepair[],
  ): Promise<number> {
    return repairSmsParsedMerchants(workplaceId, repairs);
  }

  prepareLink(
    record: TransactionInboxRecord,
    journalId: JournalId,
    disposition: InboxProcessingStatus.IMPORTED | InboxProcessingStatus.AUTO_POSTED,
  ): Model {
    return prepareInboxLink(record, journalId, disposition);
  }

  prepareUnlink(record: TransactionInboxRecord): Model {
    return prepareInboxUnlink(record);
  }

  prepareStatus(record: TransactionInboxRecord, status: InboxProcessingStatus): Model {
    return prepareInboxStatus(record, status);
  }

  prepareUpsert(
    data: TransactionInboxRecordWriteData,
    existingRecord: TransactionInboxRecord | null,
    auditContext?: InboxAuditContext,
  ): { ops: Model[]; record: TransactionInboxRecord } {
    return prepareInboxUpsert(data, existingRecord, auditContext);
  }

  /** Device capture and optional Workplace consumption share the journal's atomic write. */
  async stageUpsertInSession(
    session: AccountingWriteSession,
    data: TransactionInboxRecordWriteData,
    existingRecord: InboxRecordSnapshot | null,
    auditContext?: InboxAuditContext,
    options: DeviceSmsWriteOptions = { origin: 'manual', queueReview: false },
  ): Promise<void> {
    return stageInboxUpsertInSession(session, data, existingRecord, auditContext, options);
  }

  async stageLinkByIdInSession(
    session: AccountingWriteSession,
    workplaceId: WorkplaceId,
    recordId: string,
    journalId: JournalId,
    disposition: InboxProcessingStatus.IMPORTED | InboxProcessingStatus.AUTO_POSTED,
    auditContext?: InboxAuditContext,
  ): Promise<void> {
    return stageInboxLinkByIdInSession(
      session,
      workplaceId,
      recordId,
      journalId,
      disposition,
      auditContext,
    );
  }

  async persistLink(
    workplaceId: WorkplaceId,
    recordId: string,
    journalId: JournalId,
    disposition: InboxProcessingStatus.IMPORTED | InboxProcessingStatus.AUTO_POSTED,
  ): Promise<void> {
    return persistInboxLink(workplaceId, recordId, journalId, disposition);
  }

  async persistUnlink(workplaceId: WorkplaceId, recordId: string): Promise<void> {
    return persistInboxUnlink(workplaceId, recordId);
  }

  async persistStatus(
    workplaceId: WorkplaceId,
    recordId: string,
    status: InboxProcessingStatus,
  ): Promise<void> {
    return persistInboxStatus(workplaceId, recordId, status);
  }
}

export const transactionInboxRepository = new TransactionInboxRepository();
