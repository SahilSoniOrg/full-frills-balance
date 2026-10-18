import { Q } from '@nozbe/watermelondb';
import { database } from '@/src/data/database/Database';
import SyncCheckpoint from '@/src/data/models/SyncCheckpoint';
import SyncConflict from '@/src/data/models/SyncConflict';
import SyncPendingCommit from '@/src/data/models/SyncPendingCommit';
import SyncRowIndex from '@/src/data/models/SyncRowIndex';
import { WorkplaceId } from '@/src/types/ids';

export type SyncRowIndexValue = Readonly<{
  tableName: string;
  rowId: string;
  contentHash: string;
  leafHash: string;
  seq: number;
}>;
export type SyncCheckpointValue = Readonly<{
  seq: number;
  manifestHash: string;
  authorDeviceId: string;
}>;

/**
 * Device-local V2 state. Mutating methods deliberately require the caller to
 * already hold database.write(); callers use the InWriter suffix to make that
 * transaction boundary visible and avoid nested writer-lock deadlocks.
 */
export class SyncStateRepository {
  inWriter<T>(work: () => Promise<T>): Promise<T> {
    return database.write(work);
  }

  async readIndexInWriter(workplaceId: WorkplaceId): Promise<SyncRowIndexValue[]> {
    const rows = await database.collections
      .get<SyncRowIndex>('sync_row_index')
      .query(Q.where('workplace_id', workplaceId))
      .fetch();
    return rows.map(({ tableName, rowId, contentHash, leafHash, seq }) => ({
      tableName,
      rowId,
      contentHash,
      leafHash,
      seq,
    }));
  }

  async replaceIndexInWriter(
    workplaceId: WorkplaceId,
    rows: readonly SyncRowIndexValue[],
  ): Promise<void> {
    const collection = database.collections.get<SyncRowIndex>('sync_row_index');
    const previous = await collection.query(Q.where('workplace_id', workplaceId)).fetch();
    const operations = [
      ...previous.map(row => row.prepareDestroyPermanently()),
      ...rows.map(value =>
        collection.prepareCreate(record => {
          record.workplaceId = workplaceId;
          record.tableName = value.tableName;
          record.rowId = value.rowId;
          record.contentHash = value.contentHash;
          record.leafHash = value.leafHash;
          record.seq = value.seq;
        }),
      ),
    ];
    if (operations.length) await database.batch(...operations);
  }

  async readCheckpoint(workplaceId: WorkplaceId): Promise<SyncCheckpointValue | null> {
    const rows = await database.collections
      .get<SyncCheckpoint>('sync_checkpoints')
      .query(Q.where('workplace_id', workplaceId))
      .fetch();
    const checkpoint = rows[0];
    return checkpoint
      ? {
          seq: checkpoint.seq,
          manifestHash: checkpoint.manifestHash,
          authorDeviceId: checkpoint.authorDeviceId,
        }
      : null;
  }

  async writeCheckpointInWriter(
    workplaceId: WorkplaceId,
    value: SyncCheckpointValue,
  ): Promise<void> {
    const collection = database.collections.get<SyncCheckpoint>('sync_checkpoints');
    const previous = await collection.query(Q.where('workplace_id', workplaceId)).fetch();
    const old = previous[0];
    if (old) {
      await old.update(record => {
        record.seq = value.seq;
        record.manifestHash = value.manifestHash;
        record.authorDeviceId = value.authorDeviceId;
      });
      for (const duplicate of previous.slice(1)) await duplicate.destroyPermanently();
      return;
    }
    await collection.create(record => {
      record.workplaceId = workplaceId;
      record.seq = value.seq;
      record.manifestHash = value.manifestHash;
      record.authorDeviceId = value.authorDeviceId;
    });
  }

  async putConflictInWriter(
    workplaceId: WorkplaceId,
    groupKey: string,
    localRowsJson: string,
    remoteSeq: number,
  ): Promise<void> {
    const collection = database.collections.get<SyncConflict>('sync_conflicts');
    const rows = await collection
      .query(Q.where('workplace_id', workplaceId), Q.where('group_key', groupKey))
      .fetch();
    const existing = rows[0];
    if (existing) {
      await existing.update(record => {
        record.localRowsJson = localRowsJson;
        record.remoteSeq = remoteSeq;
      });
      return;
    }
    await collection.create(record => {
      record.workplaceId = workplaceId;
      record.groupKey = groupKey;
      record.localRowsJson = localRowsJson;
      record.remoteSeq = remoteSeq;
      record.createdAt = new Date();
    });
  }

  async putPendingCommitInWriter(
    workplaceId: WorkplaceId,
    seq: number,
    manifestJson: string,
    envelopesJson: string,
    reason: string,
  ): Promise<void> {
    const collection = database.collections.get<SyncPendingCommit>('sync_pending_commits');
    const rows = await collection
      .query(Q.where('workplace_id', workplaceId), Q.where('seq', seq))
      .fetch();
    const existing = rows[0];
    if (existing) {
      await existing.update(record => {
        record.manifestJson = manifestJson;
        record.envelopesJson = envelopesJson;
        record.reason = reason;
      });
      return;
    }
    await collection.create(record => {
      record.workplaceId = workplaceId;
      record.seq = seq;
      record.manifestJson = manifestJson;
      record.envelopesJson = envelopesJson;
      record.reason = reason;
      record.createdAt = new Date();
    });
  }
}

export const syncStateRepository = new SyncStateRepository();
