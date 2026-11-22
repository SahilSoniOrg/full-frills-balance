import { database } from '@/src/data/database/Database';
import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import type DeviceSmsInboxRecord from '@/src/data/models/DeviceSmsInboxRecord';
import {
  deviceSmsInboxRepository,
  deviceSmsSnapshot,
} from '@/src/data/repositories/DeviceSmsInboxRepository';
import { inboxSnapshotFromRecord } from '@/src/data/repositories/inboxRecordFields';
import { InboxProcessingStatus } from '@/src/types/enums';
import type { InboxRecordSnapshot, TransactionInboxRecordWriteData } from '@/src/types/smsInbox';
import { JournalId, WorkplaceId } from '@/src/types/ids';
import { Q } from '@nozbe/watermelondb';

export function isProcessedStatus(status: InboxProcessingStatus): boolean {
  return (
    status === InboxProcessingStatus.IMPORTED ||
    status === InboxProcessingStatus.AUTO_POSTED ||
    status === InboxProcessingStatus.DISMISSED
  );
}

export function inboxCollection() {
  return database.collections.get<TransactionInboxRecord>('transaction_inbox_records');
}

export async function copiesForSourceIds(sourceIds: string[]): Promise<TransactionInboxRecord[]> {
  if (!sourceIds.length) return [];
  return inboxCollection()
    .query(Q.where('channel', 'sms'), Q.where('device_source_id', Q.oneOf(sourceIds)))
    .fetch();
}

export function projectInbox(
  workplaceId: WorkplaceId,
  devices: DeviceSmsInboxRecord[],
  copies: TransactionInboxRecord[],
  names: ReadonlyMap<WorkplaceId, string> = new Map(),
): InboxRecordSnapshot[] {
  const sourceIds = new Set(devices.map(record => record.deviceSourceId));
  const copiesBySource = new Map<string, TransactionInboxRecord[]>();
  for (const copy of copies) {
    const group = copiesBySource.get(copy.deviceSourceId) ?? [];
    group.push(copy);
    copiesBySource.set(copy.deviceSourceId, group);
  }
  return [
    ...devices.map(device => {
      const consumed = copiesBySource.get(device.deviceSourceId) ?? [];
      const local = consumed.find(copy => copy.workplaceId === workplaceId);
      const deviceProjection = deviceSmsSnapshot(device, workplaceId);
      return {
        ...(local ? inboxSnapshotFromRecord(local) : deviceProjection),
        suggestedSourceAccountId: deviceProjection.suggestedSourceAccountId,
        suggestedCategoryAccountId: deviceProjection.suggestedCategoryAccountId,
        recognition: deviceProjection.recognition,
        senderAddress: local?.senderAddress ?? deviceProjection.senderAddress,
        rawBody: local?.rawBody ?? deviceProjection.rawBody,
        contentDigest: device.contentDigest,
        id: device.id,
        deviceInboxId: device.id,
        consumedWorkplaces: consumed
          .filter(
            copy => copy.workplaceId !== workplaceId && isProcessedStatus(copy.processingStatus),
          )
          .map(copy => ({
            workplaceId: copy.workplaceId,
            name: names.get(copy.workplaceId) ?? 'Another workplace',
          })),
      };
    }),
    ...copies
      .filter(copy => copy.workplaceId === workplaceId && !sourceIds.has(copy.deviceSourceId))
      .map(copy => inboxSnapshotFromRecord(copy)),
  ].sort((a, b) => b.inputDate - a.inputDate);
}

export async function findInboxRecord(
  workplaceId: WorkplaceId,
  id: string,
): Promise<InboxRecordSnapshot | null> {
  const device = await deviceSmsInboxRepository.find(id);
  if (device)
    return projectInbox(
      workplaceId,
      [device],
      await copiesForSourceIds([device.deviceSourceId]),
    )[0];
  const records = await inboxCollection()
    .query(Q.where('id', id), Q.where('workplace_id', workplaceId))
    .fetch();
  return records[0] ? inboxSnapshotFromRecord(records[0]) : null;
}

export async function findByDeviceSourceIds(
  workplaceId: WorkplaceId,
  deviceSourceIds: string[],
): Promise<InboxRecordSnapshot[]> {
  if (!deviceSourceIds.length) return [];
  const [devices, copies] = await Promise.all([
    deviceSmsInboxRepository.findBySourceIds(deviceSourceIds),
    copiesForSourceIds(deviceSourceIds),
  ]);
  const canonicalCopies = devices.length
    ? await copiesForSourceIds(devices.map(device => device.deviceSourceId))
    : [];
  return projectInbox(workplaceId, devices, [
    ...new Map([...copies, ...canonicalCopies].map(copy => [copy.id, copy])).values(),
  ]);
}

export async function findMatchingSms(
  workplaceId: WorkplaceId,
  data: TransactionInboxRecordWriteData,
): Promise<InboxRecordSnapshot | null> {
  const device = await deviceSmsInboxRepository.findMatch(data);
  return device ? findInboxRecord(workplaceId, device.id) : null;
}

/** Inbox rows already linked to any of the given journals (any channel). */
export async function findLinksForJournals(
  workplaceId: WorkplaceId,
  journalIds: JournalId[],
): Promise<{ journalId: JournalId; channel: string; reference?: string | null }[]> {
  if (journalIds.length === 0) return [];
  const records = await inboxCollection()
    .query(
      Q.where('workplace_id', workplaceId),
      Q.where('linked_journal_id', Q.oneOf(journalIds)),
    )
    .fetch();
  return records.flatMap(row =>
    row.linkedJournalId
      ? [
          {
            journalId: row.linkedJournalId,
            channel: row.channel,
            reference: row.referenceNumber ?? null,
          },
        ]
      : [],
  );
}
