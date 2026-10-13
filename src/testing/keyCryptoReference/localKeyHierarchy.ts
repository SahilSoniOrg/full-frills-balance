import type { DeviceKeyVault } from './deviceKeyVault';
import type { KeyCiphertextStateStore } from '@/src/services/backup/keyCiphertextStateStore';
import {
  keyFingerprint,
  encryptWorkplaceSnapshot,
  decryptWorkplaceSnapshot,
} from './encryptedSnapshot';
import { keyBytes, keyHex } from '@/src/services/backup/keyEncoding';
import { snapshotCrypto } from './snapshotCryptoProvider';
import {
  generateUserSigningPair,
  parseUserPublicIdentity,
  userIdentityFingerprint,
  verifyUserSigningPair,
  signUserMessage,
  type UserPublicIdentity,
} from './userIdentity';
import type { RecoveryArtifactSource } from '@/src/services/backup/recoveryArtifactSource';
import { MissingKeyStateError } from '@/src/services/backup/keyStateErrors';
import {
  generateEncryptionPair,
  createRecoveryRecipient,
  openRecoveryEnvelope,
  sealKeyEnvelope,
  openKeyEnvelope,
  publicKeyId,
  parseKeyEnvelope,
  type EnvelopeContext,
  type KeyEnvelope,
  type RecoveryCredential,
} from './keyEnvelopes';

if (process.env.NODE_ENV !== 'test') throw new Error('__FFB_JS_KEY_CRYPTO_TEST_ONLY__');

export interface KeyAccessIdentity {
  userId: string;
  registeredDeviceId: string;
  userKeyFingerprint: string;
}
export interface UserRecoveryPackage {
  format: 'full-frills-user-recovery';
  formatVersion: 1;
  userId: string;
  publicIdentity: UserPublicIdentity;
  userKeyFingerprint: string;
  recoveryPublicKey: string;
  recoveryEnvelope: KeyEnvelope;
}
export interface LocalUserKeys extends UserRecoveryPackage {
  deviceId: string;
  devicePublicKey: string;
  deviceKeyId: string;
  deviceEnvelope: KeyEnvelope;
  recoveryConfirmed: boolean;
}
export interface WorkplaceKeys {
  format: 'full-frills-workplace-keys';
  formatVersion: 1;
  userId: string;
  workplaceId: string;
  userKeyFingerprint: string;
  keyId: string;
  memberEnvelope: KeyEnvelope;
  recoveryPublicKey: string;
  recoveryEnvelope: KeyEnvelope;
  recoveryConfirmed: boolean;
  writerDeviceId: string;
  encryptionInvocations: number;
}
export interface WorkplaceKeyAccess {
  withWorkplaceKey<T>(
    identity: KeyAccessIdentity,
    workplaceId: string,
    callback: (dek: Uint8Array) => Promise<T>,
    forEncryption?: boolean,
  ): Promise<T>;
}
export interface EncryptionSetupStatus {
  user: 'not-started' | 'interrupted' | 'pending' | 'ready' | 'recovery-required';
  identity?: KeyAccessIdentity;
  workplace?: 'missing' | 'interrupted' | 'pending' | 'ready' | 'recovery-required';
  writerAllowed?: boolean;
  budgetExhausted?: boolean;
}
export function recoveryManifestMessage(identity: KeyAccessIdentity, digest: string): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify([
      'full-frills-local-recovery',
      1,
      identity.userId,
      identity.userKeyFingerprint,
      digest,
    ]),
  );
}
const MAX_ENCRYPTIONS = 2 ** 20;
const queues = new WeakMap<KeyCiphertextStateStore, Promise<unknown>>();
const userScope = (userId: string, deviceId: string) => JSON.stringify(['user', userId, deviceId]);
const workplaceScope = (userId: string, workplaceId: string) =>
  JSON.stringify(['workplace', userId, workplaceId]);
const workplaceIdentityScope = (userId: string, workplaceId: string) =>
  JSON.stringify(['workplace-identity', userId, workplaceId]);

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid key state');
  return value as Record<string, unknown>;
}
function strings(raw: Record<string, unknown>, fields: string[]): void {
  if (fields.some(field => typeof raw[field] !== 'string' || !raw[field]))
    throw new Error('Invalid key state identity');
}
function exactFields(raw: Record<string, unknown>, fields: string[]): void {
  if (Object.keys(raw).some(key => !fields.includes(key)))
    throw new Error('Unsupported key state field');
}
const USER_FIELDS = [
  'format',
  'formatVersion',
  'userId',
  'publicIdentity',
  'userKeyFingerprint',
  'recoveryPublicKey',
  'recoveryEnvelope',
];
const DEVICE_FIELDS = [
  'deviceId',
  'devicePublicKey',
  'deviceKeyId',
  'deviceEnvelope',
  'recoveryConfirmed',
];
export function parseUserRecoveryPackage(value: unknown): UserRecoveryPackage {
  const raw = object(value);
  strings(raw, ['userId', 'userKeyFingerprint', 'recoveryPublicKey']);
  if (raw.format !== 'full-frills-user-recovery' || raw.formatVersion !== 1)
    throw new Error('Unsupported User key format');
  const identity = parseUserPublicIdentity(raw.publicIdentity);
  if (identity.userId !== raw.userId) throw new Error('User identity scope mismatch');
  keyBytes(String(raw.recoveryPublicKey));
  parseKeyEnvelope(raw.recoveryEnvelope);
  return value as UserRecoveryPackage;
}
function parseLocalUser(value: unknown): LocalUserKeys {
  parseUserRecoveryPackage(value);
  const raw = object(value);
  exactFields(raw, [...USER_FIELDS, ...DEVICE_FIELDS]);
  strings(raw, ['deviceId', 'devicePublicKey', 'deviceKeyId']);
  if (typeof raw.recoveryConfirmed !== 'boolean') throw new Error('Invalid User setup state');
  keyBytes(String(raw.devicePublicKey));
  parseKeyEnvelope(raw.deviceEnvelope);
  return value as LocalUserKeys;
}
export function parseWorkplaceKeys(value: unknown): WorkplaceKeys {
  const raw = object(value);
  exactFields(raw, [
    'format',
    'formatVersion',
    'userId',
    'workplaceId',
    'userKeyFingerprint',
    'keyId',
    'memberEnvelope',
    'recoveryPublicKey',
    'recoveryEnvelope',
    'recoveryConfirmed',
    'writerDeviceId',
    'encryptionInvocations',
  ]);
  strings(raw, [
    'userId',
    'workplaceId',
    'userKeyFingerprint',
    'keyId',
    'recoveryPublicKey',
    'writerDeviceId',
  ]);
  if (
    raw.format !== 'full-frills-workplace-keys' ||
    raw.formatVersion !== 1 ||
    typeof raw.recoveryConfirmed !== 'boolean' ||
    typeof raw.encryptionInvocations !== 'number' ||
    !Number.isSafeInteger(raw.encryptionInvocations) ||
    raw.encryptionInvocations < 0 ||
    raw.encryptionInvocations > MAX_ENCRYPTIONS
  )
    throw new Error('Invalid Workplace key state');
  parseKeyEnvelope(raw.memberEnvelope);
  parseKeyEnvelope(raw.recoveryEnvelope);
  keyBytes(String(raw.recoveryPublicKey));
  return value as WorkplaceKeys;
}

function userRecoveryContext(user: UserRecoveryPackage, recipientKeyId: string): EnvelopeContext {
  return {
    purpose: 'user-recovery',
    userId: user.userId,
    keyId: user.userKeyFingerprint,
    recipientKeyId,
  };
}
function deviceContext(
  userId: string,
  deviceId: string,
  keyId: string,
  recipientKeyId: string,
): EnvelopeContext {
  return { purpose: 'device-user-bundle', userId, deviceId, keyId, recipientKeyId };
}
async function memberContext(
  keys: WorkplaceKeys,
  user: UserRecoveryPackage,
): Promise<EnvelopeContext> {
  return {
    purpose: 'user-workplace-dek',
    userId: keys.userId,
    workplaceId: keys.workplaceId,
    keyId: keys.keyId,
    recipientKeyId: await publicKeyId(user.publicIdentity.encryptionPublicKey),
  };
}
export async function workplaceRecoveryContext(keys: WorkplaceKeys): Promise<EnvelopeContext> {
  return {
    purpose: 'workplace-dump',
    userId: keys.userId,
    workplaceId: keys.workplaceId,
    keyId: keys.keyId,
    recipientKeyId: await publicKeyId(keys.recoveryPublicKey),
  };
}

type UserPrivateKeys = { encryption: Uint8Array; signing: Uint8Array };
function clearUserKeys(keys?: UserPrivateKeys): void {
  keys?.encryption.fill(0);
  keys?.signing.fill(0);
}
async function decodeUserBundle(
  bytes: Uint8Array,
  user: UserRecoveryPackage,
): Promise<UserPrivateKeys> {
  const raw = object(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  if (
    Object.keys(raw).some(
      key => !['userId', 'publicIdentity', 'privateKey', 'signingPrivateKey'].includes(key),
    ) ||
    raw.userId !== user.userId ||
    (await userIdentityFingerprint(parseUserPublicIdentity(raw.publicIdentity))) !==
      user.userKeyFingerprint ||
    typeof raw.privateKey !== 'string' ||
    typeof raw.signingPrivateKey !== 'string' ||
    raw.signingPrivateKey.length < 96 ||
    raw.signingPrivateKey.length > 256 ||
    raw.signingPrivateKey.length % 2 !== 0 ||
    !/^[a-f0-9]+$/i.test(raw.signingPrivateKey) ||
    (await userIdentityFingerprint(user.publicIdentity)) !== user.userKeyFingerprint
  )
    throw new Error('Recovered User identity mismatch');
  const privateKey = keyBytes(raw.privateKey);
  const signingPrivateKey = keyBytes(
    String(raw.signingPrivateKey),
    String(raw.signingPrivateKey).length / 2,
  );
  try {
    await verifyUserSigningPair(signingPrivateKey, user.publicIdentity.signingPublicKey);
    // A public recovery recipient alone does not authenticate a sender. Check the saved pin AND key-pair possession.
    const challenge = snapshotCrypto.randomBytes(32);
    const context: EnvelopeContext = {
      purpose: 'user-recovery',
      userId: user.userId,
      recipientKeyId: await publicKeyId(user.publicIdentity.encryptionPublicKey),
    };
    const opened = await openKeyEnvelope(
      await sealKeyEnvelope(challenge, user.publicIdentity.encryptionPublicKey, context),
      privateKey,
      context,
    );
    try {
      if (keyHex(opened) !== keyHex(challenge)) throw new Error('User key pair mismatch');
    } finally {
      opened.fill(0);
      challenge.fill(0);
    }
    return { encryption: privateKey, signing: signingPrivateKey };
  } catch (error) {
    privateKey.fill(0);
    signingPrivateKey.fill(0);
    throw error;
  }
}

/** Explicit local enrollment. Backup never creates/replaces User, Device or Workplace keys. */
export class LocalKeyHierarchy implements WorkplaceKeyAccess {
  constructor(
    private readonly state: KeyCiphertextStateStore,
    private readonly vault: DeviceKeyVault,
    private readonly assertAccess: () => void,
  ) {}

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const next = (queues.get(this.state) ?? Promise.resolve())
      .catch(() => undefined)
      .then(async () => {
        this.assertAccess();
        return operation();
      });
    queues.set(
      this.state,
      next.catch(() => undefined),
    );
    return next;
  }
  private async user(userId: string, deviceId: string): Promise<LocalUserKeys> {
    const value = await this.state.read(userScope(userId, deviceId));
    if (value === null) throw new Error('Enroll or recover this User and Device first');
    const user = parseLocalUser(value);
    if (
      user.userId !== userId ||
      user.deviceId !== deviceId ||
      user.deviceKeyId !== (await publicKeyId(user.devicePublicKey))
    )
      throw new Error('User/Device key scope mismatch');
    return user;
  }
  private async withUserBundle<T>(
    user: LocalUserKeys,
    callback: (keys: UserPrivateKeys) => Promise<T>,
  ): Promise<T> {
    this.assertAccess();
    const deviceKey = await this.vault.load(user.userId, user.deviceId);
    if (!deviceKey) throw new Error('Device private key is unavailable; use User recovery');
    let bundle: Uint8Array | undefined;
    let userKey: UserPrivateKeys | undefined;
    try {
      this.assertAccess();
      bundle = await openKeyEnvelope(
        user.deviceEnvelope,
        deviceKey,
        deviceContext(user.userId, user.deviceId, user.userKeyFingerprint, user.deviceKeyId),
      );
      userKey = await decodeUserBundle(bundle, user);
      this.assertAccess();
      const result = await callback(userKey);
      this.assertAccess();
      return result;
    } finally {
      deviceKey.fill(0);
      bundle?.fill(0);
      clearUserKeys(userKey);
    }
  }

  private withUserKey<T>(
    user: LocalUserKeys,
    callback: (key: Uint8Array) => Promise<T>,
  ): Promise<T> {
    return this.withUserBundle(user, keys => callback(keys.encryption));
  }

  signRecoveryManifest(identity: KeyAccessIdentity, digest: string): Promise<string> {
    return this.exclusive(async () => {
      if (!/^sha256:[a-f0-9]{64}$/.test(digest))
        throw new Error('Invalid recovery manifest digest');
      const user = await this.readyUser(identity);
      return this.withUserBundle(user, keys =>
        signUserMessage(keys.signing, recoveryManifestMessage(identity, digest)),
      );
    });
  }

  describeSetup(
    userId: string,
    deviceId: string,
    workplaceId?: string,
  ): Promise<EncryptionSetupStatus> {
    return this.exclusive(async () => {
      let raw: unknown;
      try {
        raw = await this.state.read(userScope(userId, deviceId));
      } catch (error) {
        if (error instanceof MissingKeyStateError) return { user: 'recovery-required' };
        throw error;
      }
      if (raw === null) {
        const marker = await this.state.read(JSON.stringify(['identity', userId]));
        this.assertAccess();
        const secret = await this.vault.load(userId, deviceId);
        const hasSecret = secret !== null;
        secret?.fill(0);
        this.assertAccess();
        if (
          marker !== null &&
          object(marker).recoveryConfirmed === false &&
          object(marker).deviceId === deviceId
        )
          return { user: 'interrupted' };
        return { user: marker !== null || hasSecret ? 'recovery-required' : 'not-started' };
      }
      const user = await this.user(userId, deviceId);
      this.assertAccess();
      const secret = await this.vault.load(userId, deviceId);
      if (!secret) {
        this.assertAccess();
        return { user: 'recovery-required' };
      }
      secret.fill(0);
      this.assertAccess();
      await this.withUserKey(user, async () => undefined);
      const identity = {
        userId,
        registeredDeviceId: deviceId,
        userKeyFingerprint: user.userKeyFingerprint,
      };
      if (!user.recoveryConfirmed) return { user: 'pending', identity };
      if (!workplaceId) return { user: 'ready', identity };
      let value: unknown = null;
      try {
        value = await this.state.read(workplaceScope(userId, workplaceId));
      } catch (error) {
        if (!(error instanceof MissingKeyStateError)) throw error;
      }
      if (value === null) {
        const marker = await this.state.read(workplaceIdentityScope(userId, workplaceId));
        return {
          user: 'ready',
          identity,
          workplace:
            marker === null
              ? 'missing'
              : object(marker).recoveryConfirmed === false
                ? 'interrupted'
                : 'recovery-required',
        };
      }
      const keys = await this.workplace(identity, workplaceId);
      return {
        user: 'ready',
        identity,
        workplace: keys.recoveryConfirmed ? 'ready' : 'pending',
        writerAllowed:
          keys.writerDeviceId === deviceId && keys.encryptionInvocations < MAX_ENCRYPTIONS,
        budgetExhausted: keys.encryptionInvocations >= MAX_ENCRYPTIONS,
      };
    });
  }

  /** For a known User, missing local material is a recovery state, never enrollment permission. */
  inspectDeviceState(
    userId: string,
    deviceId: string,
  ): Promise<'ready' | 'setup-incomplete' | 'recovery-required'> {
    return this.exclusive(async () => {
      let raw: unknown;
      try {
        raw = await this.state.read(userScope(userId, deviceId));
      } catch (error) {
        if (error instanceof MissingKeyStateError) return 'recovery-required';
        throw error;
      }
      if (raw === null) return 'recovery-required';
      const user = parseLocalUser(raw);
      if (
        user.userId !== userId ||
        user.deviceId !== deviceId ||
        user.deviceKeyId !== (await publicKeyId(user.devicePublicKey))
      )
        throw new Error('User/Device key scope mismatch');
      const privateKey = await this.vault.load(userId, deviceId);
      if (!privateKey) return 'recovery-required';
      privateKey.fill(0);
      await this.withUserKey(user, async () => undefined);
      return user.recoveryConfirmed ? 'ready' : 'setup-incomplete';
    });
  }

  async recoverUserFromSource(
    credential: RecoveryCredential,
    source: RecoveryArtifactSource,
    freshDeviceId: string,
  ): Promise<KeyAccessIdentity> {
    this.assertAccess();
    const saved = await source.loadUserRecoveryPackage(credential.identityId);
    this.assertAccess();
    if (saved === null)
      throw new Error('User recovery ciphertext is unavailable; retain identity and retry');
    return this.recoverUserDevice(credential, saved, freshDeviceId);
  }

  beginUser(userId: string, deviceId: string): Promise<RecoveryCredential> {
    return this.exclusive(async () => {
      if (!userId.trim() || !deviceId.trim()) throw new Error('Invalid local identity');
      if ((await this.state.read(userScope(userId, deviceId))) !== null)
        throw new Error('User keys already exist; resume setup');
      const existing = await this.vault.load(userId, deviceId);
      if (existing) {
        existing.fill(0);
        throw new Error('Interrupted Device enrollment must be explicitly discarded first');
      }
      if ((await this.state.read(JSON.stringify(['identity', userId]))) !== null)
        throw new Error('Established User identity requires recovery, never a new root');
      const userPair = await generateEncryptionPair();
      let signingPair: Awaited<ReturnType<typeof generateUserSigningPair>> | undefined;
      let devicePair: Awaited<ReturnType<typeof generateEncryptionPair>> | undefined;
      let bundle: Uint8Array | undefined;
      try {
        devicePair = await generateEncryptionPair();
        signingPair = await generateUserSigningPair();
        const publicIdentity: UserPublicIdentity = {
          format: 'full-frills-user-identity',
          formatVersion: 1,
          userId,
          encryptionAlgorithm: 'X25519',
          encryptionPublicKey: userPair.publicKey,
          signingAlgorithm: 'Ed25519',
          signingPublicKey: signingPair.publicKey,
        };
        const userKeyFingerprint = await userIdentityFingerprint(publicIdentity);
        const recovery = await createRecoveryRecipient('user-recovery', userId, userKeyFingerprint);
        const deviceKeyId = await publicKeyId(devicePair.publicKey);
        bundle = new TextEncoder().encode(
          JSON.stringify({
            userId,
            publicIdentity,
            signingPrivateKey: keyHex(signingPair.privateKey),
            privateKey: keyHex(userPair.privateKey),
          }),
        );
        const user: LocalUserKeys = {
          format: 'full-frills-user-recovery',
          formatVersion: 1,
          userId,
          publicIdentity,
          userKeyFingerprint,
          deviceId,
          devicePublicKey: devicePair.publicKey,
          deviceKeyId,
          recoveryPublicKey: recovery.publicKey,
          recoveryEnvelope: await sealKeyEnvelope(bundle, recovery.publicKey, {
            purpose: 'user-recovery',
            userId,
            keyId: userKeyFingerprint,
            recipientKeyId: recovery.credential.recoveryKeyId,
          }),
          deviceEnvelope: await sealKeyEnvelope(
            bundle,
            devicePair.publicKey,
            deviceContext(userId, deviceId, userKeyFingerprint, deviceKeyId),
          ),
          recoveryConfirmed: false,
        };
        this.assertAccess();
        // A public enrollment marker also survives missing Device-specific state.
        await this.state.write(JSON.stringify(['identity', userId]), {
          deviceId,
          publicIdentity,
          recoveryConfirmed: false,
        });
        this.assertAccess();
        await this.vault.save(userId, deviceId, devicePair.privateKey);
        await this.withUserKey(user, async () => undefined); // Durable authenticated chain readback.
        this.assertAccess();
        await this.state.write(userScope(userId, deviceId), user);
        return recovery.credential;
      } finally {
        userPair.privateKey.fill(0);
        signingPair?.privateKey.fill(0);
        devicePair?.privateKey.fill(0);
        bundle?.fill(0);
      }
    });
  }

  confirmUserRecovery(
    userId: string,
    deviceId: string,
    credential: RecoveryCredential,
  ): Promise<KeyAccessIdentity> {
    return this.exclusive(async () => {
      const user = await this.user(userId, deviceId);
      const bytes = await openRecoveryEnvelope(
        credential,
        user.recoveryEnvelope,
        userRecoveryContext(user, await publicKeyId(user.recoveryPublicKey)),
        userId,
        user.userKeyFingerprint,
      );
      let key: UserPrivateKeys | undefined;
      try {
        key = await decodeUserBundle(bytes, user);
      } finally {
        bytes.fill(0);
        clearUserKeys(key);
      }
      this.assertAccess();
      await this.state.write(JSON.stringify(['identity', userId]), {
        deviceId,
        publicIdentity: user.publicIdentity,
        recoveryConfirmed: true,
      });
      await this.state.write(userScope(userId, deviceId), { ...user, recoveryConfirmed: true });
      return { userId, registeredDeviceId: deviceId, userKeyFingerprint: user.userKeyFingerprint };
    });
  }

  exportUserRecoveryPackage(userId: string, deviceId: string): Promise<UserRecoveryPackage> {
    return this.exclusive(async () => {
      const user = await this.user(userId, deviceId);
      if (!user.recoveryConfirmed) throw new Error('Confirm and save User recovery first');
      const {
        format,
        formatVersion,
        publicIdentity,
        userKeyFingerprint,
        recoveryPublicKey,
        recoveryEnvelope,
      } = user;
      return {
        format,
        formatVersion,
        userId,
        publicIdentity,
        userKeyFingerprint,
        recoveryPublicKey,
        recoveryEnvelope,
      };
    });
  }

  recoverUserDevice(
    credential: RecoveryCredential,
    value: unknown,
    deviceId: string,
  ): Promise<KeyAccessIdentity> {
    return this.exclusive(async () => {
      const saved = parseUserRecoveryPackage(value);
      exactFields(object(value), USER_FIELDS);
      let marker: unknown = null;
      try {
        marker = await this.state.read(JSON.stringify(['identity', saved.userId]));
      } catch (error) {
        // An independently retained credential pins the recovered identity even if this local file is lost.
        if (!(error instanceof MissingKeyStateError)) throw error;
      }
      if (
        marker !== null &&
        (await userIdentityFingerprint(parseUserPublicIdentity(object(marker).publicIdentity))) !==
          saved.userKeyFingerprint
      )
        throw new Error('Established User identity mismatch');
      if (!deviceId.trim()) throw new Error('Invalid replacement Device identity');
      if ((await this.state.read(userScope(saved.userId, deviceId))) !== null)
        throw new Error('Device identity already exists');
      const bytes = await openRecoveryEnvelope(
        credential,
        saved.recoveryEnvelope,
        userRecoveryContext(saved, await publicKeyId(saved.recoveryPublicKey)),
        saved.userId,
        saved.userKeyFingerprint,
      );
      let userKey: UserPrivateKeys | undefined;
      let pair: Awaited<ReturnType<typeof generateEncryptionPair>> | undefined;
      try {
        userKey = await decodeUserBundle(bytes, saved);
        pair = await generateEncryptionPair();
        const deviceKeyId = await publicKeyId(pair.publicKey);
        const user: LocalUserKeys = {
          ...saved,
          deviceId,
          devicePublicKey: pair.publicKey,
          deviceKeyId,
          deviceEnvelope: await sealKeyEnvelope(
            bytes,
            pair.publicKey,
            deviceContext(saved.userId, deviceId, saved.userKeyFingerprint, deviceKeyId),
          ),
          recoveryConfirmed: true,
        };
        this.assertAccess();
        await this.vault.save(saved.userId, deviceId, pair.privateKey);
        await this.withUserKey(user, async () => undefined);
        this.assertAccess();
        await this.state.write(JSON.stringify(['identity', saved.userId]), {
          deviceId,
          publicIdentity: saved.publicIdentity,
          recoveryConfirmed: true,
        });
        await this.state.write(userScope(saved.userId, deviceId), user);
        return {
          userId: saved.userId,
          registeredDeviceId: deviceId,
          userKeyFingerprint: saved.userKeyFingerprint,
        };
      } finally {
        bytes.fill(0);
        clearUserKeys(userKey);
        pair?.privateKey.fill(0);
      }
    });
  }

  enrollWorkplace(
    identity: KeyAccessIdentity,
    workplaceId: string,
    intent: 'creation' | 'local-upgrade',
  ): Promise<RecoveryCredential> {
    return this.exclusive(async () => {
      if (
        !['creation', 'local-upgrade'].includes(intent) ||
        !/^[a-zA-Z0-9_.-]{1,128}$/.test(workplaceId)
      )
        throw new Error('Explicit Workplace creation or upgrade is required');
      const user = await this.readyUser(identity);
      if ((await this.state.read(workplaceScope(identity.userId, workplaceId))) !== null)
        throw new Error('Workplace key already exists; resume its original setup');
      if ((await this.state.read(workplaceIdentityScope(identity.userId, workplaceId))) !== null)
        throw new Error('Workplace key already exists; recover its original envelopes');
      return this.withUserKey(user, async () => {
        const dek = snapshotCrypto.randomBytes(32);
        try {
          const keyId = await keyFingerprint(dek);
          const recovery = await createRecoveryRecipient('workplace-dump', workplaceId, keyId);
          const keys: WorkplaceKeys = {
            format: 'full-frills-workplace-keys',
            formatVersion: 1,
            userId: identity.userId,
            workplaceId,
            userKeyFingerprint: user.userKeyFingerprint,
            keyId,
            memberEnvelope: await sealKeyEnvelope(dek, user.publicIdentity.encryptionPublicKey, {
              purpose: 'user-workplace-dek',
              userId: identity.userId,
              workplaceId,
              keyId,
              recipientKeyId: await publicKeyId(user.publicIdentity.encryptionPublicKey),
            }),
            recoveryPublicKey: recovery.publicKey,
            recoveryEnvelope: await sealKeyEnvelope(dek, recovery.publicKey, {
              purpose: 'workplace-dump',
              userId: identity.userId,
              workplaceId,
              keyId,
              recipientKeyId: recovery.credential.recoveryKeyId,
            }),
            recoveryConfirmed: false,
            writerDeviceId: identity.registeredDeviceId,
            encryptionInvocations: 0,
          };
          this.assertAccess();
          await this.state.write(workplaceIdentityScope(identity.userId, workplaceId), {
            keyId,
            userKeyFingerprint: identity.userKeyFingerprint,
            recoveryConfirmed: false,
          });
          this.assertAccess();
          await this.state.write(workplaceScope(identity.userId, workplaceId), keys);
          return recovery.credential;
        } finally {
          dek.fill(0);
        }
      });
    });
  }

  confirmWorkplaceRecovery(
    identity: KeyAccessIdentity,
    workplaceId: string,
    credential: RecoveryCredential,
  ): Promise<void> {
    return this.exclusive(async () => {
      const user = await this.readyUser(identity);
      const keys = await this.workplace(identity, workplaceId);
      const dek = await openRecoveryEnvelope(
        credential,
        keys.recoveryEnvelope,
        await workplaceRecoveryContext(keys),
        workplaceId,
        keys.keyId,
      );
      try {
        if (dek.length !== 32 || (await keyFingerprint(dek)) !== keys.keyId)
          throw new Error('Recovery DEK mismatch');
        await this.withUserKey(user, async privateKey => {
          const memberDek = await openKeyEnvelope(
            keys.memberEnvelope,
            privateKey,
            await memberContext(keys, user),
          );
          try {
            if (keyHex(memberDek) !== keyHex(dek))
              throw new Error('Member and recovery DEKs differ');
          } finally {
            memberDek.fill(0);
          }
        });
      } finally {
        dek.fill(0);
      }
      this.assertAccess();
      await this.state.write(workplaceIdentityScope(identity.userId, workplaceId), {
        keyId: keys.keyId,
        userKeyFingerprint: identity.userKeyFingerprint,
        recoveryConfirmed: true,
      });
      this.assertAccess();
      await this.state.write(workplaceScope(identity.userId, workplaceId), {
        ...keys,
        recoveryConfirmed: true,
      });
    });
  }

  private async readyUser(identity: KeyAccessIdentity): Promise<LocalUserKeys> {
    const user = await this.user(identity.userId, identity.registeredDeviceId);
    if (!user.recoveryConfirmed || user.userKeyFingerprint !== identity.userKeyFingerprint)
      throw new Error('User key binding or recovery confirmation is missing');
    return user;
  }
  private async workplace(
    identity: KeyAccessIdentity,
    workplaceId: string,
  ): Promise<WorkplaceKeys> {
    const raw = await this.state.read(workplaceScope(identity.userId, workplaceId));
    if (raw === null)
      throw new Error('Enroll the Workplace key during creation or local upgrade first');
    const keys = parseWorkplaceKeys(raw);
    if (
      keys.userId !== identity.userId ||
      keys.workplaceId !== workplaceId ||
      keys.userKeyFingerprint !== identity.userKeyFingerprint
    )
      throw new Error('Workplace member key scope mismatch');
    return keys;
  }
  withWorkplaceKey<T>(
    identity: KeyAccessIdentity,
    workplaceId: string,
    callback: (dek: Uint8Array) => Promise<T>,
    forEncryption = false,
  ): Promise<T> {
    return this.exclusive(async () => {
      const user = await this.readyUser(identity);
      const keys = await this.workplace(identity, workplaceId);
      if (!keys.recoveryConfirmed)
        throw new Error('Confirm and save Workplace dump recovery first');
      return this.withUserKey(user, async privateKey => {
        const dek = await openKeyEnvelope(
          keys.memberEnvelope,
          privateKey,
          await memberContext(keys, user),
        );
        try {
          if (dek.length !== 32 || (await keyFingerprint(dek)) !== keys.keyId)
            throw new Error('Workplace DEK identity mismatch');
          this.assertAccess();
          if (forEncryption) {
            if (keys.writerDeviceId !== identity.registeredDeviceId)
              throw new Error('Backup writer handover is required');
            if (keys.encryptionInvocations >= MAX_ENCRYPTIONS)
              throw new Error('Workplace encryption budget exhausted');
            // Burn the reservation before callback, including failed/abandoned attempts. Retries reuse ciphertext.
            await this.state.write(workplaceScope(identity.userId, workplaceId), {
              ...keys,
              encryptionInvocations: keys.encryptionInvocations + 1,
            });
            this.assertAccess();
          }
          return await callback(dek);
        } finally {
          dek.fill(0);
        }
      });
    });
  }

  encryptSnapshot(
    identity: KeyAccessIdentity,
    workplaceId: string,
    snapshot: import('@/src/services/backup/workplaceSnapshot').WorkplaceSnapshot,
  ) {
    return this.withWorkplaceKey(
      identity,
      workplaceId,
      dek => encryptWorkplaceSnapshot(snapshot, dek),
      true,
    );
  }
  decryptSnapshot(identity: KeyAccessIdentity, workplaceId: string, value: unknown) {
    return this.withWorkplaceKey(identity, workplaceId, dek =>
      decryptWorkplaceSnapshot(value, dek),
    );
  }
  async validateRecoveryCredential(
    user: UserRecoveryPackage,
    credential: RecoveryCredential,
  ): Promise<void> {
    const bundle = await openRecoveryEnvelope(
      credential,
      user.recoveryEnvelope,
      userRecoveryContext(user, await publicKeyId(user.recoveryPublicKey)),
      user.userId,
      user.userKeyFingerprint,
    );
    bundle.fill(0);
  }
  exportWorkplaceKeys(identity: KeyAccessIdentity, workplaceId: string): Promise<WorkplaceKeys> {
    return this.exclusive(async () => {
      await this.readyUser(identity);
      return this.workplace(identity, workplaceId);
    });
  }
  installWorkplaceKeys(identity: KeyAccessIdentity, value: unknown): Promise<void> {
    return this.exclusive(async () => {
      const keys = parseWorkplaceKeys(value);
      const user = await this.readyUser(identity);
      if (
        keys.userId !== identity.userId ||
        keys.userKeyFingerprint !== identity.userKeyFingerprint ||
        !keys.recoveryConfirmed
      )
        throw new Error('Workplace member identity mismatch');
      let existing: unknown = null;
      try {
        existing = await this.state.read(workplaceScope(identity.userId, keys.workplaceId));
      } catch (error) {
        if (!(error instanceof MissingKeyStateError)) throw error;
      }
      if (existing !== null)
        throw new Error('Workplace key already exists; implicit replacement is forbidden');
      const marker = await this.state.read(
        workplaceIdentityScope(identity.userId, keys.workplaceId),
      );
      if (
        marker !== null &&
        (object(marker).keyId !== keys.keyId ||
          object(marker).userKeyFingerprint !== identity.userKeyFingerprint)
      )
        throw new Error('Established Workplace identity mismatch');
      await this.withUserKey(user, async privateKey => {
        const dek = await openKeyEnvelope(
          keys.memberEnvelope,
          privateKey,
          await memberContext(keys, user),
        );
        try {
          if ((await keyFingerprint(dek)) !== keys.keyId)
            throw new Error('Workplace DEK identity mismatch');
        } finally {
          dek.fill(0);
        }
      });
      this.assertAccess();
      await this.state.write(workplaceIdentityScope(identity.userId, keys.workplaceId), {
        keyId: keys.keyId,
        userKeyFingerprint: identity.userKeyFingerprint,
        recoveryConfirmed: true,
      });
      this.assertAccess();
      // A surviving identity marker with missing usage cannot establish how much budget was spent.
      // Burn the uncertain remainder instead of restoring an older counter, even for the old writer.
      await this.state.write(
        workplaceScope(identity.userId, keys.workplaceId),
        marker === null ? keys : { ...keys, encryptionInvocations: MAX_ENCRYPTIONS },
      );
    });
  }
  logout(userId: string, deviceId: string): Promise<void> {
    // Logout does not require an unlocked app. The queue drains borrowed keys before removing the Device key.
    const next = (queues.get(this.state) ?? Promise.resolve())
      .catch(() => undefined)
      .then(async () => {
        await this.vault.remove(userId, deviceId);
        await this.state.remove(userScope(userId, deviceId));
      });
    queues.set(
      this.state,
      next.catch(() => undefined),
    );
    return next;
  }
  discardUnconfirmedUser(userId: string, deviceId: string): Promise<void> {
    return this.exclusive(async () => {
      const raw = await this.state.read(userScope(userId, deviceId));
      if (raw !== null && parseLocalUser(raw).recoveryConfirmed)
        throw new Error('Cannot discard an established User identity');
      const marker = await this.state.read(JSON.stringify(['identity', userId]));
      if (
        marker !== null &&
        (object(marker).deviceId !== deviceId || object(marker).recoveryConfirmed !== false)
      )
        throw new Error('Cannot discard an established User identity');
      if (marker !== null) await this.state.remove(JSON.stringify(['identity', userId]));
      await this.vault.remove(userId, deviceId);
      await this.state.remove(userScope(userId, deviceId));
    });
  }
  discardUnconfirmedWorkplace(identity: KeyAccessIdentity, workplaceId: string): Promise<void> {
    return this.exclusive(async () => {
      await this.readyUser(identity);
      const raw = await this.state.read(workplaceScope(identity.userId, workplaceId));
      const marker = await this.state.read(workplaceIdentityScope(identity.userId, workplaceId));
      if (raw === null && marker !== null && object(marker).recoveryConfirmed === false) {
        await this.state.remove(workplaceIdentityScope(identity.userId, workplaceId));
        return;
      }
      const keys = await this.workplace(identity, workplaceId);
      if (keys.recoveryConfirmed || keys.encryptionInvocations !== 0)
        throw new Error('Cannot discard an established Workplace key');
      if (marker !== null && object(marker).recoveryConfirmed !== false)
        throw new Error('Cannot discard an established Workplace key');
      await this.state.remove(workplaceScope(identity.userId, workplaceId));
      await this.state.remove(workplaceIdentityScope(identity.userId, workplaceId));
    });
  }
}
