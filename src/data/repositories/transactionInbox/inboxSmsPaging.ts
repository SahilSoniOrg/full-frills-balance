import { database } from '@/src/data/database/Database';
import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import {
  deviceSmsInboxRepository,
  deviceSmsSnapshot,
} from '@/src/data/repositories/DeviceSmsInboxRepository';
import { InboxProcessingStatus } from '@/src/types/enums';
import type { InboxRecordSnapshot } from '@/src/types/smsInbox';
import { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';
import { Q } from '@nozbe/watermelondb';
import { copiesForSourceIds, inboxCollection, projectInbox } from './inboxProjection';

export interface ParsedMerchantRepair {
  recordId: string;
  previousMerchant: string;
  correctedMerchant: string;
}

export async function findAllByLinkedJournalId(
  workplaceId: WorkplaceId,
  journalId: JournalId,
): Promise<InboxRecordSnapshot[]> {
  const copies = await inboxCollection()
    .query(
      Q.where('workplace_id', workplaceId),
      Q.where('linked_journal_id', journalId),
      Q.where('channel', 'sms'),
      Q.sortBy('input_date', Q.asc),
    )
    .fetch();
  const devices = await deviceSmsInboxRepository.findBySourceIds(
    copies.map(copy => copy.deviceSourceId),
  );
  return projectInbox(workplaceId, devices, copies).sort((a, b) => a.inputDate - b.inputDate);
}

/** The database selects a bounded SMS page before any Account history is hydrated. */
export async function findRecentLinkedToAccount(
  workplaceId: WorkplaceId,
  accountId: AccountId,
  limit: number,
): Promise<InboxRecordSnapshot[]> {
  if (limit <= 0) return [];
  const copies = await inboxCollection()
    .query(
      Q.experimentalJoinTables(['journals']),
      Q.experimentalNestedJoin('journals', 'transactions'),
      Q.where('workplace_id', workplaceId),
      Q.where('channel', 'sms'),
      Q.on('journals', [
        Q.where('workplace_id', workplaceId),
        Q.on('transactions', [
          Q.where('workplace_id', workplaceId),
          Q.where('account_id', accountId),
          Q.where('deleted_at', Q.eq(null)),
        ]),
      ]),
      Q.sortBy('input_date', Q.desc),
      Q.sortBy('id', Q.desc),
      Q.take(limit),
    )
    .fetch();
  const devices = await deviceSmsInboxRepository.findBySourceIds(
    copies.map(copy => copy.deviceSourceId),
  );
  return projectInbox(workplaceId, devices, copies);
}

export async function findRecentSms(
  workplaceId: WorkplaceId,
  limit: number,
): Promise<InboxRecordSnapshot[]> {
  const [devices, copies] = await Promise.all([
    deviceSmsInboxRepository.findRecent(limit),
    inboxCollection()
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('channel', 'sms'),
        Q.sortBy('input_date', Q.desc),
        Q.take(limit),
      )
      .fetch(),
  ]);
  return projectInbox(workplaceId, devices, copies).slice(0, limit);
}

export async function findRecentPendingSms(
  workplaceId: WorkplaceId,
  limit: number,
): Promise<InboxRecordSnapshot[]> {
  const [recentDevices, pendingCopies] = await Promise.all([
    deviceSmsInboxRepository.findRecent(limit),
    inboxCollection()
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('channel', 'sms'),
        Q.where('processing_status', InboxProcessingStatus.PENDING),
        Q.sortBy('input_date', Q.desc),
        Q.take(limit),
      )
      .fetch(),
  ]);
  const pendingDevices = recentDevices.filter(
    device =>
      deviceSmsSnapshot(device, workplaceId).processingStatus === InboxProcessingStatus.PENDING,
  );
  const newestDateBySourceId = new Map<string, number>();
  for (const device of pendingDevices) {
    newestDateBySourceId.set(device.deviceSourceId, device.inputDate);
  }
  for (const copy of pendingCopies) {
    newestDateBySourceId.set(
      copy.deviceSourceId,
      Math.max(newestDateBySourceId.get(copy.deviceSourceId) ?? 0, copy.inputDate),
    );
  }
  const sourceIds = [...newestDateBySourceId.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([sourceId]) => sourceId);
  if (!sourceIds.length) return [];
  const [devicesBySource, copies] = await Promise.all([
    deviceSmsInboxRepository.findBySourceIds(sourceIds),
    copiesForSourceIds(sourceIds),
  ]);
  const devicesById = new Map(
    [...recentDevices, ...devicesBySource].map(device => [device.id, device]),
  );
  const selectedDevices = [...devicesById.values()].filter(device =>
    sourceIds.includes(device.deviceSourceId),
  );
  return projectInbox(workplaceId, selectedDevices, copies)
    .filter(record => record.processingStatus === InboxProcessingStatus.PENDING)
    .slice(0, limit);
}

// This walks the device inbox by id and then keeps this workplace's pending rows,
// because pending state lives on workplace review state rather than on the device row.
export async function findPendingSmsPage(
  workplaceId: WorkplaceId,
  afterId: string | undefined,
  limit: number,
) {
  const devices = await deviceSmsInboxRepository.findPageAfterId(afterId, limit);
  const copies = await copiesForSourceIds(devices.map(device => device.deviceSourceId));
  return {
    records: projectInbox(workplaceId, devices, copies).filter(
      record => record.deviceInboxId && record.processingStatus === InboxProcessingStatus.PENDING,
    ),
    nextCursor: devices.length === limit ? devices[devices.length - 1].id : undefined,
  };
}

export async function findRecentLinkedProcessed(
  workplaceId: WorkplaceId,
  limit: number,
): Promise<TransactionInboxRecord[]> {
  return inboxCollection()
    .query(
      Q.where('workplace_id', workplaceId),
      Q.where('channel', 'sms'),
      Q.where('linked_journal_id', Q.notEq(null)),
      Q.where(
        'processing_status',
        Q.oneOf([InboxProcessingStatus.IMPORTED, InboxProcessingStatus.AUTO_POSTED]),
      ),
      Q.sortBy('input_date', Q.desc),
      Q.take(limit),
    )
    .fetch();
}

export async function findLinkedProcessedSmsPage(
  workplaceId: WorkplaceId,
  afterId: string | undefined,
  limit: number,
): Promise<TransactionInboxRecord[]> {
  return inboxCollection()
    .query(
      Q.where('workplace_id', workplaceId),
      Q.where('channel', 'sms'),
      Q.where(
        'processing_status',
        Q.oneOf([InboxProcessingStatus.IMPORTED, InboxProcessingStatus.AUTO_POSTED]),
      ),
      Q.where('linked_journal_id', Q.notEq(null)),
      ...(afterId ? [Q.where('id', Q.gt(afterId))] : []),
      Q.sortBy('id'),
      Q.take(limit),
    )
    .fetch();
}

export async function repairParsedSmsMerchants(
  workplaceId: WorkplaceId,
  repairs: readonly ParsedMerchantRepair[],
): Promise<number> {
  if (!repairs.length) return 0;
  const repairsById = new Map(repairs.map(repair => [repair.recordId, repair]));

  return database.write(async () => {
    const records = await inboxCollection()
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('channel', 'sms'),
        Q.where('id', Q.oneOf([...repairsById.keys()])),
      )
      .fetch();
    const updates = records.flatMap(record => {
      const repair = repairsById.get(record.id);
      if (
        !repair ||
        !record.linkedJournalId ||
        ![InboxProcessingStatus.IMPORTED, InboxProcessingStatus.AUTO_POSTED].includes(
          record.processingStatus,
        ) ||
        record.parsedMerchant !== repair.previousMerchant
      ) {
        return [];
      }
      return [
        record.prepareUpdate(entry => {
          entry.parsedMerchant = repair.correctedMerchant;
        }),
      ];
    });
    if (updates.length) await database.batch(...updates);
    return updates.length;
  });
}
