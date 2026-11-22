import {
  stageModelWrite,
  type AccountingWriteSession,
} from '@/src/data/repositories/AccountingWriteSession';
import { inboxSnapshotFromRecord } from '@/src/data/repositories/inboxRecordFields';
import { InboxProcessingStatus } from '@/src/types/enums';
import type { InboxRecordSnapshot, TransactionInboxRecordWriteData } from '@/src/types/smsInbox';
import { WorkplaceId } from '@/src/types/ids';
import { Q } from '@nozbe/watermelondb';
import { inboxCollection } from './inboxProjection';
import { prepareInboxUpsert, type InboxAuditContext } from './inboxLinkSessionStaging';

/** Provider IDs are scoped to the source account and stored without message bodies. */
export async function findEmailCopies(sourceId: string): Promise<InboxRecordSnapshot[]> {
  const records = await inboxCollection()
    .query(Q.where('channel', 'email'), Q.where('device_source_id', sourceId))
    .fetch();
  return records.map(inboxSnapshotFromRecord);
}

export async function findEmail(
  workplaceId: WorkplaceId,
  id: string,
): Promise<InboxRecordSnapshot | null> {
  const records = await inboxCollection()
    .query(Q.where('id', id), Q.where('workplace_id', workplaceId), Q.where('channel', 'email'))
    .fetch();
  return records[0] ? inboxSnapshotFromRecord(records[0]) : null;
}

export async function stageEmailInSession(
  session: AccountingWriteSession,
  data: TransactionInboxRecordWriteData,
  auditContext?: InboxAuditContext,
): Promise<void> {
  if (data.channel !== 'email') throw new Error('Expected an email observation');
  const existing = await findEmailCopies(data.deviceSourceId);
  if (existing.some(record => record.workplaceId === data.workplaceId)) {
    throw new Error('This email has already been ingested');
  }
  const prepared = prepareInboxUpsert(data, null, auditContext);
  stageModelWrite(session, prepared.ops);
}

/** Workplace-scoped pending email observations for two-sided uniqueness checks. */
export async function findRecentPendingEmail(
  workplaceId: WorkplaceId,
  limit: number,
): Promise<InboxRecordSnapshot[]> {
  const records = await inboxCollection()
    .query(
      Q.where('workplace_id', workplaceId),
      Q.where('channel', 'email'),
      Q.where('processing_status', InboxProcessingStatus.PENDING),
      Q.sortBy('input_date', Q.desc),
      Q.take(limit),
    )
    .fetch();
  return records.map(inboxSnapshotFromRecord);
}
