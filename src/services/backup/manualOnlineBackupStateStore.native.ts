import * as SecureStore from 'expo-secure-store';
import { File, Paths } from 'expo-file-system';
import type { ManualBackupStateStore } from './manualOnlineBackupContracts';
import { snapshotFingerprint, parseEncryptedSnapshotEnvelope } from './encryptedSnapshot';

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  requireAuthentication: false,
};

// Immutable ciphertext files + small SecureStore pointer avoid destructive overwrite. Expo's
// move(overwrite:true) deletes the destination first on iOS, so it cannot provide atomic replacement.
// A same-directory rename to a NEW filename publishes only a complete file. Pointer failure leaves
// the previous pending item intact. Orphan/temp cleanup and power-loss/fsync proof are release gates.
let queue: Promise<unknown> = Promise.resolve();
function exclusive<T>(operation: () => Promise<T>): Promise<T> {
  const next = queue.catch(() => undefined).then(operation);
  queue = next.catch(() => undefined);
  return next;
}

async function scopeId(userId: string, workplaceId: string): Promise<string> {
  if (!userId.trim() || !/^[a-zA-Z0-9_.-]{1,128}$/.test(workplaceId))
    throw new Error('Invalid backup scope');
  return (await snapshotFingerprint(JSON.stringify([userId, workplaceId]))).slice(7);
}
function key(kind: string, id: string): string {
  return `manual_online_backup_v1_${kind}_${id}`;
}
function fileFor(id: string, snapshotId: string): File {
  if (!/^[a-f0-9]{32}$/.test(snapshotId)) throw new Error('Invalid pending snapshot ID');
  return new File(Paths.document, `manual-online-backup-${id}-${snapshotId}.json`);
}
function scoped(raw: unknown, userId: string, workplaceId: string): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('Invalid backup state');
  const record = raw as Record<string, unknown>;
  if (
    record.userId !== userId ||
    record.workplaceId !== workplaceId ||
    typeof record.userKeyFingerprint !== 'string' ||
    !record.userKeyFingerprint ||
    typeof record.registeredDeviceId !== 'string' ||
    !record.registeredDeviceId
  )
    throw new Error('Backup state scope mismatch');
  return record;
}
function timestamp(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('Invalid backup state timestamp');
  return value;
}
function identityFields(record: Record<string, unknown>, userId: string, workplaceId: string) {
  if (
    typeof record.userKeyFingerprint !== 'string' ||
    typeof record.registeredDeviceId !== 'string'
  )
    throw new Error('Invalid backup identity fields');
  return {
    userId,
    workplaceId,
    userKeyFingerprint: record.userKeyFingerprint,
    registeredDeviceId: record.registeredDeviceId,
  };
}
async function read(kind: string, userId: string, workplaceId: string) {
  const raw = await SecureStore.getItemAsync(
    key(kind, await scopeId(userId, workplaceId)),
    OPTIONS,
  );
  return raw === null ? null : scoped(JSON.parse(raw), userId, workplaceId);
}
async function write<T extends { userId: string; workplaceId: string }>(kind: string, record: T) {
  await SecureStore.setItemAsync(
    key(kind, await scopeId(record.userId, record.workplaceId)),
    JSON.stringify(record),
    OPTIONS,
  );
}

export const manualBackupStateStore: ManualBackupStateStore = {
  async loadConsent(userId, workplaceId) {
    const record = await read('consent', userId, workplaceId);
    if (!record) return null;
    return {
      ...identityFields(record, userId, workplaceId),
      consentedAt: timestamp(record.consentedAt),
      ...(record.revokedAt === undefined ? {} : { revokedAt: timestamp(record.revokedAt) }),
    };
  },
  saveConsent(consent) {
    return exclusive(async () => {
      scoped(consent, consent.userId, consent.workplaceId);
      const existing = await read('consent', consent.userId, consent.workplaceId);
      if (existing?.revokedAt !== undefined && consent.revokedAt === undefined)
        throw new Error('Revoked consent cannot be silently reactivated');
      await write('consent', consent);
    });
  },
  async loadPending(userId, workplaceId) {
    const record = await read('pending', userId, workplaceId);
    if (!record) return null;
    if (typeof record.snapshotId !== 'string' || typeof record.contentHash !== 'string')
      throw new Error('Invalid pending index');
    const file = fileFor(await scopeId(userId, workplaceId), record.snapshotId);
    if (!file.exists)
      throw new Error('Pending ciphertext is missing; restore original setup before continuing');
    const json = await file.text();
    if ((await snapshotFingerprint(json)) !== record.contentHash)
      throw new Error('Pending ciphertext integrity mismatch');
    const envelope = parseEncryptedSnapshotEnvelope(JSON.parse(json));
    if (envelope.workplaceId !== workplaceId || envelope.snapshotId !== record.snapshotId)
      throw new Error('Pending envelope identity mismatch');
    return {
      ...identityFields(record, userId, workplaceId),
      consentAcceptedAt: timestamp(record.consentAcceptedAt),
      envelope,
    };
  },
  savePending(pending) {
    return exclusive(async () => {
      scoped(pending, pending.userId, pending.workplaceId);
      if (pending.envelope.workplaceId !== pending.workplaceId)
        throw new Error('Pending ciphertext scope mismatch');
      const id = await scopeId(pending.userId, pending.workplaceId);
      const envelopeJson = JSON.stringify(pending.envelope);
      const contentHash = await snapshotFingerprint(envelopeJson);
      const existing = await read('pending', pending.userId, pending.workplaceId);
      if (
        existing &&
        (existing.snapshotId !== pending.envelope.snapshotId ||
          existing.contentHash !== contentHash ||
          existing.userKeyFingerprint !== pending.userKeyFingerprint ||
          existing.registeredDeviceId !== pending.registeredDeviceId)
      )
        throw new Error('Existing pending snapshot must be resumed; replacement is forbidden');
      const finalFile = fileFor(id, pending.envelope.snapshotId);
      if (!finalFile.exists) {
        const temporary = new File(Paths.document, `${finalFile.name}.tmp`);
        temporary.create({ overwrite: true });
        temporary.write(envelopeJson);
        temporary.rename(finalFile.name);
      } else if ((await finalFile.text()) !== envelopeJson) {
        throw new Error('Pending snapshot ID has different ciphertext');
      }
      const { envelope, ...metadata } = pending;
      await write('pending', { ...metadata, snapshotId: envelope.snapshotId, contentHash });
    });
  },
  clearPending(userId, workplaceId, expectedSnapshotId) {
    return exclusive(async () => {
      const existing = await read('pending', userId, workplaceId);
      if (existing && existing.snapshotId !== expectedSnapshotId)
        throw new Error('Pending snapshot changed; refusing stale acknowledgement cleanup');
      await SecureStore.deleteItemAsync(
        key('pending', await scopeId(userId, workplaceId)),
        OPTIONS,
      );
      if (existing && typeof existing.snapshotId === 'string') {
        const file = fileFor(await scopeId(userId, workplaceId), existing.snapshotId);
        if (file.exists) file.delete();
      }
    });
  },
};
