import { AppConfig } from '@/src/constants';
import { accountQueryRepository } from '@/src/data/repositories/account';
import Workplace from '@/src/data/models/Workplace';
import { importRepository } from '@/src/data/repositories/ImportRepository';
import { currencyReadService } from '@/src/services/currency-read-service';
import { rebuildAllAccountBalancesAfterImport } from '@/src/services/import/importAccountBalanceRebuild';
import { validateImportedData } from '@/src/services/import/validateImportedData';
import {
  parseExportedUserRecoveryPackage,
  type KeyAccessIdentity,
  type WorkplaceKeys,
} from '@/src/services/backup/keyHierarchyRecords';
import { localKeyHierarchy } from '@/src/services/backup/localKeyHierarchy';
import {
  parseRecoveryCredential,
  type RecoveryCredential,
} from '@/src/services/backup/keyEnvelopes';
import {
  userIdentityFingerprint,
  type UserPublicIdentity,
} from '@/src/services/backup/userIdentity';
import { keyHex } from '@/src/services/backup/keyEncoding';
import { preferences } from '@/src/services/preferences';
import type { BatchImportData } from '@/src/types/importContracts';
import type { WorkplaceId } from '@/src/types/ids';
import { KeyOperationError } from '@/src/utils/keyOperationError';
import { parseObject } from '@/src/utils/strictObject';
import { parseBackupZip } from './backupFile';
import { verifyRowManifest } from './manifestVerify';
import { parseRowEnvelope, type RowEnvelopeJson, type RowManifestJson } from './rowEnvelope';
import { computeMerkleRootFromLeaves, hashRowLeaf, type MerkleLeaf } from './codec/merkle';
import { hashManifest } from './codec/manifestBytes';
import { decodeCanonicalRow } from './shortKeys';
import { rowImportData, validateWorkplaceRows, type RowSourceRecord } from './rowSource';
import { MAX_ROW_BATCH_BYTES, MAX_ROW_BATCH_COUNT } from './rowCrypto';

export type RestoreBackupAccess = Readonly<
  | { mode: 'existing'; identity: KeyAccessIdentity }
  | { mode: 'recovery'; credential: unknown; deviceId: string }
>;

export type RestoreBackupResult = Readonly<{
  identity: KeyAccessIdentity;
  workplace: Workplace;
  manifestHash: string;
  rowCount: number;
  warnings: readonly string[];
}>;

type ParsedEnvelope = ReturnType<typeof parseRowEnvelope>;
type EnvelopeEntry = Readonly<{ value: RowEnvelopeJson; parsed: ParsedEnvelope }>;

function assertIdentityMatchesPackage(
  identity: KeyAccessIdentity,
  userId: string,
  fingerprint: string,
): void {
  if (identity.userId !== userId || identity.userKeyFingerprint !== fingerprint)
    throw new Error('Local User identity does not match the backup recovery package');
}

async function resolveIdentity(
  userRecoveryPackageValue: unknown,
  access: RestoreBackupAccess,
): Promise<{
  identity: KeyAccessIdentity;
  publicIdentity: UserPublicIdentity;
  fingerprint: string;
}> {
  const userRecoveryPackage = parseExportedUserRecoveryPackage(userRecoveryPackageValue);
  const calculatedFingerprint = await userIdentityFingerprint(userRecoveryPackage.publicIdentity);
  if (calculatedFingerprint !== userRecoveryPackage.userKeyFingerprint)
    throw new Error('Backup User recovery package fingerprint mismatch');

  if (access.mode === 'existing') {
    assertIdentityMatchesPackage(
      access.identity,
      userRecoveryPackage.userId,
      userRecoveryPackage.userKeyFingerprint,
    );
    return {
      identity: access.identity,
      publicIdentity: userRecoveryPackage.publicIdentity,
      fingerprint: userRecoveryPackage.userKeyFingerprint,
    };
  }

  const credential: RecoveryCredential = parseRecoveryCredential(access.credential);
  if (
    credential.purpose !== 'user-recovery' ||
    credential.identityId !== userRecoveryPackage.userId ||
    credential.identityKeyId !== userRecoveryPackage.userKeyFingerprint
  )
    throw new Error('Recovery credential does not match the backup User');
  await localKeyHierarchy.validateRecoveryCredential(userRecoveryPackage, credential);
  // Recovery may have completed on an earlier attempt that failed during row validation
  // or publication. Reuse that verified Device instead of trying to enroll it again.
  const setup = await localKeyHierarchy.describeSetup(userRecoveryPackage.userId, access.deviceId);
  if (setup.user === 'ready' && setup.identity) {
    assertIdentityMatchesPackage(
      setup.identity,
      userRecoveryPackage.userId,
      userRecoveryPackage.userKeyFingerprint,
    );
    return {
      identity: setup.identity,
      publicIdentity: userRecoveryPackage.publicIdentity,
      fingerprint: userRecoveryPackage.userKeyFingerprint,
    };
  }
  const identity = await localKeyHierarchy.recoverUserDevice(
    credential,
    userRecoveryPackage,
    access.deviceId,
  );
  assertIdentityMatchesPackage(
    identity,
    userRecoveryPackage.userId,
    userRecoveryPackage.userKeyFingerprint,
  );
  return {
    identity,
    publicIdentity: userRecoveryPackage.publicIdentity,
    fingerprint: userRecoveryPackage.userKeyFingerprint,
  };
}

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

/**
 * Verifies, decrypts and validates a complete genesis backup before publishing any rows.
 * No server-sync index/checkpoint is read or written by this flow.
 */
export async function restoreBackup(
  zipBytes: Uint8Array,
  access: RestoreBackupAccess,
): Promise<RestoreBackupResult> {
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
  // Do not persist a recovered User identity until the archive's manifest signature is trusted.
  const { identity } = await resolveIdentity(userRecoveryPackage, access);
  if (
    backup.workplaceKeys.userId !== identity.userId ||
    backup.workplaceKeys.userKeyFingerprint !== identity.userKeyFingerprint ||
    backup.workplaceKeys.workplaceId !== verifiedManifest.fields.workplaceId ||
    backup.workplaceKeys.keyId !== verifiedManifest.fields.keyId
  )
    throw new Error('Backup Workplace key scope mismatch');

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
    const decrypted = await localKeyHierarchy.decryptRows(
      identity,
      backup.workplaceKeys.workplaceId,
      batch.map(entry => entry.value),
      backup.workplaceKeys as WorkplaceKeys,
    );
    if (decrypted.length !== batch.length) throw new Error('Decrypted backup row count mismatch');
    for (let index = 0; index < batch.length; index += 1) {
      const entry = batch[index];
      const plaintext = decrypted[index];
      if (!plaintext.ok) throw new KeyOperationError(plaintext.error);
      if (plaintext.table !== entry.parsed.table || plaintext.rowId !== entry.parsed.rowId)
        throw new Error('Decrypted backup row identity mismatch');
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
  const data: BatchImportData = rowImportData(validatedRows);
  validateImportedData(data);
  const metadata = metadataRecord(validatedRows);
  await validateCurrencyPrecisions(metadata);

  if (
    typeof metadata.name !== 'string' ||
    typeof metadata.icon !== 'string' ||
    typeof metadata.defaultCurrencyCode !== 'string' ||
    typeof metadata.safeToSpendDays !== 'number'
  )
    throw new Error('Invalid restored Workplace metadata');

  // Validate both installed keys and any durable identity marker before publishing rows.
  // Otherwise a failed installation could strand the committed restore receipt.
  const keyState = await localKeyHierarchy.preflightWorkplaceRestore(
    identity,
    backup.workplaceKeys,
  );

  const manifestHash = keyHex(await hashManifest(verifiedManifest.fields));
  const workplace = await importRepository.batchInsertRowRestore(
    {
      id: workplaceId,
      name: metadata.name,
      icon: metadata.icon,
      defaultCurrencyCode: metadata.defaultCurrencyCode,
    },
    data,
    manifestHash,
  );

  // Preferences are device-local and outside the DB transaction. Persist them only after
  // publication so a failed row validation/collision cannot leave a partial restore behind.
  if (keyState === 'installable') {
    await localKeyHierarchy.installWorkplaceKeys(identity, backup.workplaceKeys);
  }
  preferences.workplace.update(workplaceId, {
    safeToSpendDays: metadata.safeToSpendDays as 30 | 60 | 90,
  });

  const warnings: string[] = [];
  try {
    const accounts = await accountQueryRepository.findAll(workplaceId);
    await rebuildAllAccountBalancesAfterImport(
      workplaceId,
      accounts,
      AppConfig.performance.import.postImportAccountRebuildConcurrency,
    );
  } catch {
    // The books and recovery keys are already published; preserve restore success and surface
    // the derived-data failure to the caller for a later retry or user-visible warning.
    warnings.push('Post-restore running-balance rebuild failed');
  }

  return {
    identity,
    workplace,
    manifestHash,
    rowCount: verifiedManifest.fields.rowCount,
    warnings,
  };
}
