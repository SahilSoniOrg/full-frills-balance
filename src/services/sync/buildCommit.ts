import { ROW_COMPRESSION } from '@/src/services/crypto/protocol/rowCompression';
import { generator } from '@/src/data/database/idGenerator';
import {
  syncStateRepository,
  type SyncRowIndexValue,
} from '@/src/data/repositories/SyncStateRepository';
import { localKeyHierarchy } from '@/src/services/backup/localKeyHierarchy';
import type { KeyAccessIdentity } from '@/src/services/backup/keyHierarchyRecords';
import { keyBytes, keyHex } from '@/src/services/backup/keyEncoding';
import { contentHash } from './canonicalJson';
import type { RowManifestFields } from '@/src/services/crypto/protocol/manifestBytes';
import { hashManifest } from '@/src/services/crypto/protocol/manifestBytes';
import {
  hashRowLeaf,
  computeMerkleRootFromLeaves,
  type MerkleLeaf,
} from '@/src/services/crypto/protocol/merkle';
import { decodeUtf8, encodeUtf8 } from '@/src/services/crypto/protocol/tlv';
import {
  parseRowEnvelope,
  type RowEnvelopeJson,
} from '@/src/services/crypto/protocol/envelopeJson';
import { canonicalRowBytes, rowContentHash } from './shortKeys';
import type { EncryptRow } from '@/src/services/crypto/protocol/rowCrypto';
import { MAX_ROW_BATCH_BYTES, MAX_ROW_BATCH_COUNT } from '@/src/services/crypto/protocol/rowCrypto';
import type { RowManifestJson } from '@/src/services/crypto/protocol/rowEnvelope';
import {
  assertRowTable,
  CURRENT_ROW_SCHEMA_VERSION,
  ROW_TABLE_NAMES,
  type RowTable,
} from './rowTables';
import { rowSource } from './rowSource';
import { WorkplaceId } from '@/src/types/ids';

const ZERO_HASH = '0'.repeat(64);
const CONTENT_HASH_TOMBSTONE = 'tombstone:';

export type BuiltRowCommit = Readonly<{
  manifest: RowManifestJson;
  manifestHash: string;
  envelopes: readonly RowEnvelopeJson[];
  /** Proposed server-sync state; callers persist it only after CAS acceptance. */
  nextIndex: readonly SyncRowIndexValue[];
}>;

export type BuiltBackupCommit = Readonly<{
  manifest: RowManifestJson;
  envelopes: readonly RowEnvelopeJson[];
}>;

async function tombstoneHash(table: RowTable, rowId: string): Promise<string> {
  return `${CONTENT_HASH_TOMBSTONE}${await contentHash({ tombstone: true, table, rowId })}`;
}

function makeBatches(rows: readonly EncryptRow[]): EncryptRow[][] {
  const batches: EncryptRow[][] = [];
  let batch: EncryptRow[] = [];
  let bytes = 0;
  for (const row of rows) {
    assertRowTable(row.table);
    const size = encodeUtf8(row.plaintext, 'row plaintext').length;
    if (
      batch.length &&
      (batch.length === MAX_ROW_BATCH_COUNT || bytes + size > MAX_ROW_BATCH_BYTES)
    ) {
      batches.push(batch);
      batch = [];
      bytes = 0;
    }
    batch.push(row);
    bytes += size;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

/**
 * Captures, validates, diffs, encrypts, and signs under the DB writer lock.
 * It returns a proposed index only; a caller must persist it after an accepted
 * server CAS. Offline backup does not use this incremental path.
 */
export async function buildCommit(
  identity: KeyAccessIdentity,
  workplaceId: WorkplaceId,
): Promise<BuiltRowCommit> {
  const workplaceKeys = await localKeyHierarchy.exportWorkplaceKeys(identity, workplaceId);
  return syncStateRepository.inWriter(async () => {
    const [records, previousIndex, checkpoint] = await Promise.all([
      rowSource.readWorkplaceRowsInWriter(workplaceId),
      syncStateRepository.readIndexInWriter(workplaceId),
      syncStateRepository.readCheckpoint(workplaceId),
    ]);
    const priorByKey = new Map(
      previousIndex.map(entry => [`${entry.tableName}\u0000${entry.rowId}`, entry]),
    );
    const currentByKey = new Map(records.map(row => [`${row.table}\u0000${row.rowId}`, row]));
    const changed: EncryptRow[] = [];
    const contentHashes = new Map<string, string>();

    for (const row of records) {
      const key = `${row.table}\u0000${row.rowId}`;
      const contentHash = await rowContentHash(row.table, row.content);
      contentHashes.set(key, contentHash);
      if (priorByKey.get(key)?.contentHash === contentHash) continue;
      const plaintext = decodeUtf8(canonicalRowBytes(row.table, row.content), 'canonical row');
      changed.push({
        table: row.table,
        rowId: row.rowId,
        updatedAt: row.updatedAt,
        deleted: false,
        schemaVersion: CURRENT_ROW_SCHEMA_VERSION,
        compression: ROW_COMPRESSION,
        plaintext,
      });
    }

    const now = Date.now();
    const currentlyDeleted = previousIndex.filter(entry => {
      if (currentByKey.has(`${entry.tableName}\u0000${entry.rowId}`)) return false;
      if (!ROW_TABLE_NAMES.includes(entry.tableName as RowTable))
        throw new Error(`Unknown indexed row table: ${entry.tableName}`);
      return !entry.contentHash.startsWith(CONTENT_HASH_TOMBSTONE);
    });
    const deletedKeys = new Set(
      currentlyDeleted.map(entry => `${entry.tableName}\u0000${entry.rowId}`),
    );
    for (const entry of currentlyDeleted) {
      const table = entry.tableName as RowTable;
      changed.push({
        table,
        rowId: entry.rowId,
        updatedAt: now,
        deleted: true,
        schemaVersion: CURRENT_ROW_SCHEMA_VERSION,
        compression: ROW_COMPRESSION,
        plaintext: '',
      });
    }

    const envelopes: RowEnvelopeJson[] = [];
    for (const batch of makeBatches(changed))
      envelopes.push(...(await localKeyHierarchy.encryptRows(identity, workplaceId, batch)));

    const envelopeByKey = new Map<string, RowEnvelopeJson>();
    for (const envelope of envelopes)
      envelopeByKey.set(`${envelope.table}\u0000${envelope.rowId}`, envelope);
    const leaves: MerkleLeaf[] = [];
    const nextIndex: SyncRowIndexValue[] = [];
    const seq = checkpoint ? checkpoint.seq + 1 : 0;
    if (!Number.isSafeInteger(seq)) throw new Error('Sync sequence exhausted');

    for (const row of records) {
      const key = `${row.table}\u0000${row.rowId}`;
      const previous = priorByKey.get(key);
      const envelope = envelopeByKey.get(key);
      let leafHash: Uint8Array;
      if (envelope) leafHash = await hashRowLeaf(parseRowEnvelope(envelope));
      else if (previous) leafHash = keyBytes(previous.leafHash);
      else throw new Error('Changed row is missing its encrypted envelope');
      leaves.push({ table: row.table, rowId: row.rowId, hash: leafHash });
      nextIndex.push({
        tableName: row.table,
        rowId: row.rowId,
        contentHash: contentHashes.get(key)!,
        leafHash: keyHex(leafHash),
        seq: envelope ? seq : previous!.seq,
      });
    }
    for (const entry of previousIndex) {
      const key = `${entry.tableName}\u0000${entry.rowId}`;
      if (!deletedKeys.has(key) && !currentByKey.has(key)) {
        leaves.push({
          table: entry.tableName as RowTable,
          rowId: entry.rowId,
          hash: keyBytes(entry.leafHash),
        });
        nextIndex.push(entry);
      }
    }
    for (const entry of currentlyDeleted) {
      const envelope = envelopeByKey.get(`${entry.tableName}\u0000${entry.rowId}`);
      if (!envelope) throw new Error('Deleted row is missing its encrypted tombstone');
      const leafHash = await hashRowLeaf(parseRowEnvelope(envelope));
      leaves.push({ table: entry.tableName as RowTable, rowId: entry.rowId, hash: leafHash });
      nextIndex.push({
        tableName: entry.tableName,
        rowId: entry.rowId,
        contentHash: await tombstoneHash(entry.tableName as RowTable, entry.rowId),
        leafHash: keyHex(leafHash),
        seq,
      });
    }

    const root = await computeMerkleRootFromLeaves(leaves, leaves.length);
    const fields: RowManifestFields = {
      formatVersion: 1,
      workplaceId,
      keyId: workplaceKeys.keyId,
      id: generator(),
      seq,
      prevHash: checkpoint ? keyBytes(checkpoint.manifestHash) : keyBytes(ZERO_HASH),
      authorUserId: identity.userId,
      authorDeviceId: identity.registeredDeviceId,
      rowCount: leaves.length,
      root,
      createdAt: now,
    };
    const signature = await localKeyHierarchy.signRowManifest(identity, fields);
    return {
      manifest: {
        ...fields,
        formatVersion: 1,
        prevHash: keyHex(fields.prevHash),
        root: keyHex(fields.root),
        signature,
      },
      manifestHash: keyHex(await hashManifest(fields)),
      envelopes,
      nextIndex,
    };
  });
}

/** Builds a complete independent seq-zero backup; never reads or writes sync state. */
export async function buildBackupCommit(
  identity: KeyAccessIdentity,
  workplaceId: WorkplaceId,
): Promise<BuiltBackupCommit> {
  const workplaceKeys = await localKeyHierarchy.exportWorkplaceKeys(identity, workplaceId);
  return syncStateRepository.inWriter(async () => {
    const records = await rowSource.readWorkplaceRowsInWriter(workplaceId);
    const encryptRows = records.map(row => ({
      table: row.table,
      rowId: row.rowId,
      updatedAt: row.updatedAt,
      deleted: false,
      schemaVersion: CURRENT_ROW_SCHEMA_VERSION,
      compression: ROW_COMPRESSION,
      plaintext: decodeUtf8(canonicalRowBytes(row.table, row.content), 'canonical row'),
    }));
    const envelopes: RowEnvelopeJson[] = [];
    for (const batch of makeBatches(encryptRows))
      envelopes.push(...(await localKeyHierarchy.encryptRows(identity, workplaceId, batch)));
    const leaves: MerkleLeaf[] = [];
    for (const envelope of envelopes) {
      const parsed = parseRowEnvelope(envelope);
      leaves.push({ table: parsed.table, rowId: parsed.rowId, hash: await hashRowLeaf(parsed) });
    }
    const fields: RowManifestFields = {
      formatVersion: 1,
      workplaceId,
      keyId: workplaceKeys.keyId,
      id: generator(),
      seq: 0,
      prevHash: keyBytes(ZERO_HASH),
      authorUserId: identity.userId,
      authorDeviceId: identity.registeredDeviceId,
      rowCount: leaves.length,
      root: await computeMerkleRootFromLeaves(leaves, leaves.length),
      createdAt: Date.now(),
    };
    const signature = await localKeyHierarchy.signRowManifest(identity, fields);
    return {
      manifest: {
        ...fields,
        formatVersion: 1,
        prevHash: keyHex(fields.prevHash),
        root: keyHex(fields.root),
        signature,
      },
      envelopes,
    };
  });
}
