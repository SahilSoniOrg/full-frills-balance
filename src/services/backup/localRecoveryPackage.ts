import {
  parseEncryptedSnapshotEnvelope,
  snapshotFingerprint,
  type EncryptedSnapshot,
} from './encryptedSnapshot';
import {
  parseUserRecoveryPackage,
  parseWorkplaceKeys,
  recoveryManifestMessage,
  type KeyHierarchy,
  type KeyAccessIdentity,
  type UserRecoveryPackage,
  type WorkplaceKeys,
} from './localKeyHierarchy';
import { userIdentityFingerprint, verifyUserMessage } from './userIdentity';
export { parseRecoveryCredential } from './recoveryCredential';

export const MAX_RECOVERY_PACKAGE_BYTES = 48 * 1024 * 1024;
export interface LocalRecoveryPackage {
  format: 'full-frills-local-recovery';
  formatVersion: 1;
  userRecoveryPackage: UserRecoveryPackage;
  workplaceKeys: WorkplaceKeys;
  snapshot: EncryptedSnapshot;
  signature: string;
}

async function manifestDigest(value: Omit<LocalRecoveryPackage, 'signature'>): Promise<string> {
  return snapshotFingerprint(
    JSON.stringify([
      value.format,
      value.formatVersion,
      value.userRecoveryPackage,
      value.workplaceKeys,
      value.snapshot,
    ]),
  );
}

function parsePackage(value: unknown): LocalRecoveryPackage {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid encrypted package');
  const raw = value as Record<string, unknown>;
  if (
    Object.keys(raw).sort().join(',') !==
      'format,formatVersion,signature,snapshot,userRecoveryPackage,workplaceKeys' ||
    raw.format !== 'full-frills-local-recovery' ||
    raw.formatVersion !== 1 ||
    typeof raw.signature !== 'string' ||
    !/^[a-f0-9]{128}$/.test(raw.signature)
  )
    throw new Error('Unsupported encrypted package');
  const user = parseUserRecoveryPackage(raw.userRecoveryPackage);
  // The recovery package never exports a Device bundle, even as an unknown field.
  if (
    Object.keys(user).sort().join(',') !==
    'format,formatVersion,publicIdentity,recoveryEnvelope,recoveryPublicKey,userId,userKeyFingerprint'
  )
    throw new Error('Unexpected User recovery field');
  const keys = parseWorkplaceKeys(raw.workplaceKeys);
  const snapshot = parseEncryptedSnapshotEnvelope(raw.snapshot);
  if (
    keys.userId !== user.userId ||
    keys.userKeyFingerprint !== user.userKeyFingerprint ||
    keys.workplaceId !== snapshot.workplaceId ||
    keys.keyId !== snapshot.keyId ||
    !keys.recoveryConfirmed
  )
    throw new Error('Encrypted package identity mismatch');
  return value as LocalRecoveryPackage;
}

export async function createLocalRecoveryPackage(
  hierarchy: KeyHierarchy,
  identity: KeyAccessIdentity,
  workplaceId: string,
  snapshot: EncryptedSnapshot,
): Promise<LocalRecoveryPackage> {
  const body: Omit<LocalRecoveryPackage, 'signature'> = {
    format: 'full-frills-local-recovery',
    formatVersion: 1,
    userRecoveryPackage: await hierarchy.exportUserRecoveryPackage(
      identity.userId,
      identity.registeredDeviceId,
    ),
    workplaceKeys: await hierarchy.exportWorkplaceKeys(identity, workplaceId),
    snapshot,
  };
  const value = {
    ...body,
    signature: await hierarchy.signRecoveryManifest(identity, await manifestDigest(body)),
  };
  await verifyLocalRecoveryPackage(value, identity);
  if (new TextEncoder().encode(JSON.stringify(value)).length > MAX_RECOVERY_PACKAGE_BYTES)
    throw new Error('Encrypted package is too large');
  return value;
}

/** Authenticate the complete file before any enrollment, envelope installation or database writes. */
export async function verifyLocalRecoveryPackage(
  value: unknown,
  expected: Pick<KeyAccessIdentity, 'userId' | 'userKeyFingerprint'>,
): Promise<LocalRecoveryPackage> {
  const saved = parsePackage(value);
  const user = saved.userRecoveryPackage;
  if (
    user.userId !== expected.userId ||
    user.userKeyFingerprint !== expected.userKeyFingerprint ||
    (await userIdentityFingerprint(user.publicIdentity)) !== expected.userKeyFingerprint
  )
    throw new Error('Recovery package User identity mismatch');
  await verifyUserMessage(
    user.publicIdentity.signingPublicKey,
    recoveryManifestMessage({ ...expected, registeredDeviceId: '' }, await manifestDigest(saved)),
    saved.signature,
  );
  return saved;
}
