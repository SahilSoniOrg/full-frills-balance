/** Shared archive verification for identity restore and independent Workplace salvage. */
import type { RowSourceRecord } from './rowRecords';
import { assertRowTable } from './rowTables';
import { assertRowCompression } from '@/src/services/crypto/protocol/rowCompression';
import { parseExportedUserRecoveryPackage } from '@/src/services/backup/keyHierarchyRecords';
import { userIdentityFingerprint } from '@/src/services/backup/userIdentity';
import { keyHex } from '@/src/services/backup/keyEncoding';
import { KeyOperationError } from '@/src/utils/keyOperationError';
import { parseBackupZip } from './backupFile';
import { verifyRowManifest } from './manifestVerify';
import {
  type RowEnvelopeJson,
  type RowManifestJson,
} from '@/src/services/crypto/protocol/rowEnvelope';
import type { DecryptedRow } from '@/src/services/crypto/protocol/rowCrypto';
import { parseRowEnvelope } from './rowEnvelope';
import {
  computeMerkleRootFromLeaves,
  hashRowLeaf,
  type MerkleLeaf,
} from '@/src/services/crypto/protocol/merkle';
import { hashManifest } from '@/src/services/crypto/protocol/manifestBytes';
import { decodeCanonicalRow } from './shortKeys';
import { MAX_ROW_BATCH_BYTES, MAX_ROW_BATCH_COUNT } from '@/src/services/crypto/protocol/rowCrypto';
import { validateWorkplaceRows } from './workplaceRowValidation';
import { currencyReadService } from '@/src/services/currency-read-service';
import { parseObject } from '@/src/utils/strictObject';
import type { WorkplaceId } from '@/src/types/ids';

type ParsedEnvelope = ReturnType<typeof parseRowEnvelope>;
type EnvelopeEntry = Readonly<{ value: RowEnvelopeJson; parsed: ParsedEnvelope }>;

function envelopeBatches(entries: readonly EnvelopeEntry[]): EnvelopeEntry[][] {
  const batches: EnvelopeEntry[][] = [];
  let batch: EnvelopeEntry[] = [];
  let bytes = 0;
  for (const entry of entries) {
    const size = entry.parsed.ciphertext.length;
    if (size > MAX_ROW_BATCH_BYTES) throw new Error('Backup row exceeds native batch limit');
    if (
      batch.length > 0 &&
      (batch.length >= MAX_ROW_BATCH_COUNT || bytes + size > MAX_ROW_BATCH_BYTES)
    ) {
      batches.push(batch);
      batch = [];
      bytes = 0;
    }
    batch.push(entry);
    bytes += size;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}

function metadataRecord(rows: readonly RowSourceRecord[]): Readonly<Record<string, unknown>> {
  const row = rows.find(candidate => candidate.table === 'workplace');
  if (!row) throw new Error('Restored Workplace metadata is missing');
  return row.content;
}

async function validateCurrencyPrecisions(
  metadata: Readonly<Record<string, unknown>>,
): Promise<void> {
  const precisionMap = parseObject(
    metadata.currencyPrecisions,
    'Invalid Workplace currency precision map',
  );
  for (const [code, expected] of Object.entries(precisionMap)) {
    const local = await currencyReadService.getPrecision(code);
    if (local !== expected)
      throw new Error(`Local currency precision differs from backup for ${code}`);
  }
}

export async function readVerifiedBackup(zipBytes: Uint8Array) {
  const backup = parseBackupZip(zipBytes);
  const userRecoveryPackage = parseExportedUserRecoveryPackage(backup.userRecoveryPackage);
  const fingerprint = await userIdentityFingerprint(userRecoveryPackage.publicIdentity);
  if (fingerprint !== userRecoveryPackage.userKeyFingerprint)
    throw new KeyOperationError('FFB_ROW_INTEGRITY');
  const manifest = backup.manifest as RowManifestJson;
  const verifiedManifest = await verifyRowManifest(
    manifest,
    {
      workplaceId: backup.workplaceKeys.workplaceId,
      keyId: backup.workplaceKeys.keyId,
      authorUserId: userRecoveryPackage.userId,
    },
    userRecoveryPackage.publicIdentity,
    fingerprint,
  );
  if (
    backup.workplaceKeys.userId !== userRecoveryPackage.userId ||
    backup.workplaceKeys.userKeyFingerprint !== fingerprint ||
    backup.workplaceKeys.workplaceId !== verifiedManifest.fields.workplaceId ||
    backup.workplaceKeys.keyId !== verifiedManifest.fields.keyId
  )
    throw new Error('Backup Workplace key scope mismatch');
  return { backup, userRecoveryPackage, verifiedManifest };
}

export async function decryptVerifiedBackup(
  verified: Awaited<ReturnType<typeof readVerifiedBackup>>,
  decrypt: (envelopes: readonly RowEnvelopeJson[]) => Promise<readonly DecryptedRow[]>,
  assertActive: () => void,
) {
  const { backup, verifiedManifest } = verified;
  const entries: EnvelopeEntry[] = backup.envelopes.map(value => {
    const parsed = parseRowEnvelope(value, {
      workplaceId: backup.workplaceKeys.workplaceId,
      keyId: backup.workplaceKeys.keyId,
    });
    if (parsed.deleted) throw new Error('Offline backup contains a tombstone');
    return { value, parsed } as EnvelopeEntry;
  });

  const rows: RowSourceRecord[] = [];
  const leaves: MerkleLeaf[] = [];
  for (const batch of envelopeBatches(entries)) {
    assertActive();
    const decrypted = await decrypt(batch.map(entry => entry.value));
    assertActive();
    if (decrypted.length !== batch.length) throw new Error('Decrypted backup row count mismatch');
    for (let index = 0; index < batch.length; index += 1) {
      const entry = batch[index];
      const plaintext = decrypted[index];
      if (!plaintext.ok) throw new KeyOperationError(plaintext.error);
      if (plaintext.table !== entry.parsed.table || plaintext.rowId !== entry.parsed.rowId)
        throw new Error('Decrypted backup row identity mismatch');
      assertRowTable(plaintext.table);
      assertRowCompression(plaintext.compression);
      const content = decodeCanonicalRow(
        plaintext.table,
        plaintext.schemaVersion,
        new TextEncoder().encode(plaintext.plaintext),
      );
      rows.push({
        table: entry.parsed.table,
        rowId: entry.parsed.rowId,
        updatedAt: entry.parsed.updatedAt,
        deleted: false,
        content,
      });
      leaves.push({
        table: entry.parsed.table,
        rowId: entry.parsed.rowId,
        hash: await hashRowLeaf(entry.parsed),
      });
    }
  }

  const root = await computeMerkleRootFromLeaves(leaves, verifiedManifest.fields.rowCount);
  if (keyHex(root) !== keyHex(verifiedManifest.fields.root))
    throw new KeyOperationError('FFB_ROW_INTEGRITY');

  const workplaceId = verifiedManifest.fields.workplaceId as WorkplaceId;
  const validatedRows = validateWorkplaceRows(rows, workplaceId);
  const metadata = metadataRecord(validatedRows);
  await validateCurrencyPrecisions(metadata);

  if (
    typeof metadata.name !== 'string' ||
    typeof metadata.icon !== 'string' ||
    typeof metadata.defaultCurrencyCode !== 'string' ||
    typeof metadata.safeToSpendDays !== 'number'
  )
    throw new Error('Invalid restored Workplace metadata');

  assertActive();
  return {
    rows: validatedRows,
    metadata: {
      name: metadata.name,
      icon: metadata.icon,
      defaultCurrencyCode: metadata.defaultCurrencyCode,
      safeToSpendDays: metadata.safeToSpendDays as 30 | 60 | 90,
    },
    manifestHash: keyHex(await hashManifest(verifiedManifest.fields)),
  };
}
