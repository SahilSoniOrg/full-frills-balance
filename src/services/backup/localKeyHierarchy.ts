import { keyCiphertextStateStore, type KeyCiphertextStateStore } from './keyCiphertextStateStore';
import { nativeKeyOperations } from './nativeKeyOperations';
import {
  parseNativeKeyReference,
  type NativeKeyReference,
  type NativeKeyOperations,
  type RecoveryOperation,
} from './nativeKeyApi';
import { assertKeyAccessAllowed } from './keyAccessPolicy';
import { MissingKeyStateError } from './keyStateErrors';
import { parseRecoveryCredential } from './recoveryCredential';
import type { RecoveryCredential } from './keyEnvelopes';
import { publicKeyId } from './keyEnvelopes';
import { parseUserPublicIdentity, userIdentityFingerprint } from './userIdentity';
import { parseEncryptedSnapshotEnvelope, type EncryptedSnapshot } from './encryptedSnapshot';
import {
  decodeWorkplaceSnapshot,
  serializeWorkplaceSnapshot,
  type WorkplaceSnapshot,
} from './workplaceSnapshot';
import type { RecoveryArtifactSource } from './recoveryArtifactSource';
import {
  parseLocalUser,
  parseWorkplaceKeys,
  parseUserRecoveryPackage,
  userScope,
  workplaceScope,
  workplaceIdentityScope,
  type KeyAccessIdentity,
  type LocalUserKeys,
  type UserRecoveryPackage,
  type WorkplaceKeys,
  type EncryptionSetupStatus,
} from './keyHierarchyRecords';
export {
  parseWorkplaceKeys,
  parseUserRecoveryPackage,
  recoveryManifestMessage,
  workplaceRecoveryContext,
} from './keyHierarchyRecords';
export type {
  KeyAccessIdentity,
  LocalUserKeys,
  UserRecoveryPackage,
  WorkplaceKeys,
  EncryptionSetupStatus,
} from './keyHierarchyRecords';

/** Workflow contract: callers request operations, never borrow private-key bytes. */
export interface KeyHierarchy {
  beginUser(userId: string, deviceId: string): Promise<RecoveryCredential>;
  confirmUserRecovery(
    userId: string,
    deviceId: string,
    credential: RecoveryCredential,
  ): Promise<KeyAccessIdentity>;
  describeSetup(
    userId: string,
    deviceId: string,
    workplaceId?: string,
  ): Promise<EncryptionSetupStatus>;
  inspectDeviceState(
    userId: string,
    deviceId: string,
  ): Promise<'ready' | 'setup-incomplete' | 'recovery-required'>;
  recoverUserFromSource(
    credential: RecoveryCredential,
    source: RecoveryArtifactSource,
    deviceId: string,
  ): Promise<KeyAccessIdentity>;
  recoverUserDevice(
    credential: RecoveryCredential,
    value: unknown,
    deviceId: string,
  ): Promise<KeyAccessIdentity>;
  enrollWorkplace(
    identity: KeyAccessIdentity,
    workplaceId: string,
    intent: 'creation' | 'local-upgrade',
  ): Promise<RecoveryCredential>;
  confirmWorkplaceRecovery(
    identity: KeyAccessIdentity,
    workplaceId: string,
    credential: RecoveryCredential,
  ): Promise<void>;
  exportUserRecoveryPackage(userId: string, deviceId: string): Promise<UserRecoveryPackage>;
  exportWorkplaceKeys(identity: KeyAccessIdentity, workplaceId: string): Promise<WorkplaceKeys>;
  installWorkplaceKeys(identity: KeyAccessIdentity, value: unknown): Promise<void>;
  signRecoveryManifest(identity: KeyAccessIdentity, digest: string): Promise<string>;
  encryptSnapshot(
    identity: KeyAccessIdentity,
    workplaceId: string,
    snapshot: WorkplaceSnapshot,
  ): Promise<EncryptedSnapshot>;
  decryptSnapshot(
    identity: KeyAccessIdentity,
    workplaceId: string,
    value: unknown,
  ): Promise<WorkplaceSnapshot>;
  validateRecoveryCredential(
    user: UserRecoveryPackage,
    credential: RecoveryCredential,
  ): Promise<void>;
  logout(userId: string, deviceId: string): Promise<void>;
  discardUnconfirmedUser(userId: string, deviceId: string): Promise<void>;
  discardUnconfirmedWorkplace(identity: KeyAccessIdentity, workplaceId: string): Promise<void>;
}
const MAX_ENCRYPTIONS = 2 ** 20;
const queues = new WeakMap<KeyCiphertextStateStore, Promise<unknown>>();
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid native key result');
  return value as Record<string, unknown>;
}

/** Owns public checkpoints/usage. All secret-bearing operations execute natively. */
export class LocalKeyHierarchy implements KeyHierarchy {
  constructor(
    private readonly state: KeyCiphertextStateStore,
    private readonly assertAccess: () => void,
    private readonly crypto: NativeKeyOperations = nativeKeyOperations,
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
  private async invoke(operation: RecoveryOperation, request: unknown): Promise<unknown> {
    this.assertAccess();
    const result = await this.crypto.recovery(operation, request);
    this.assertAccess();
    return result;
  }
  private async withReference<T>(key: NativeKeyReference, operation: () => Promise<T>): Promise<T> {
    try {
      this.assertAccess();
      const result = await operation();
      this.assertAccess();
      return result;
    } finally {
      await this.crypto.releaseKey(key);
    }
  }
  private async withUserReference<T>(
    user: LocalUserKeys,
    operation: (key: NativeKeyReference) => Promise<T>,
  ): Promise<T> {
    this.assertAccess();
    const key = await this.crypto.openKey({ kind: 'user', user });
    return this.withReference(key, () => operation(key));
  }
  private async withWorkplaceReference<T>(
    user: LocalUserKeys,
    keys: WorkplaceKeys,
    operation: (key: NativeKeyReference) => Promise<T>,
  ): Promise<T> {
    return this.withUserReference(user, async userKey => {
      this.assertAccess();
      const key = await this.crypto.openKey({ kind: 'workplace', user: userKey, keys });
      return this.withReference(key, () => operation(key));
    });
  }
  private async hasDevice(userId: string, deviceId: string): Promise<boolean> {
    this.assertAccess();
    const result = await this.crypto.hasKey({ kind: 'device', userId, deviceId });
    this.assertAccess();
    if (typeof result !== 'boolean') throw new Error('Invalid Device vault result');
    return result;
  }
  private async user(userId: string, deviceId: string): Promise<LocalUserKeys> {
    const raw = await this.state.read(userScope(userId, deviceId));
    if (raw === null) throw new Error('Enroll or recover this User and Device first');
    const user = parseLocalUser(raw);
    if (
      user.userId !== userId ||
      user.deviceId !== deviceId ||
      user.deviceKeyId !== (await publicKeyId(user.devicePublicKey))
    )
      throw new Error('User/Device key scope mismatch');
    return user;
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
  private identity(user: LocalUserKeys): KeyAccessIdentity {
    return {
      userId: user.userId,
      registeredDeviceId: user.deviceId,
      userKeyFingerprint: user.userKeyFingerprint,
    };
  }
  beginUser(userId: string, deviceId: string): Promise<RecoveryCredential> {
    return this.exclusive(async () => {
      if (!userId.trim() || !deviceId.trim()) throw new Error('Invalid User or Device identity');
      if ((await this.state.read(userScope(userId, deviceId))) !== null)
        throw new Error('User keys already exist; resume setup');
      if (await this.hasDevice(userId, deviceId))
        throw new Error('Interrupted Device enrollment must be explicitly discarded first');
      if ((await this.state.read(JSON.stringify(['identity', userId]))) !== null)
        throw new Error('Established User identity requires recovery, never a new root');
      // Public intent precedes native key creation. A killed call cannot silently regenerate the root.
      await this.state.write(JSON.stringify(['identity', userId]), {
        deviceId,
        recoveryConfirmed: false,
        enrollmentPending: true,
      });
      const device = parseNativeKeyReference(
        await this.crypto.generateKeys({ kind: 'device', userId, deviceId }),
      );
      const result = await this.withReference(device, async () => {
        const generated = object(await this.crypto.generateKeys({ kind: 'user', device }));
        await this.crypto.releaseKey(parseNativeKeyReference(generated.key));
        return generated;
      });
      const user = parseLocalUser(result.user),
        credential = parseRecoveryCredential(result.credential);
      if (
        user.userId !== userId ||
        user.deviceId !== deviceId ||
        credential.identityId !== userId ||
        credential.identityKeyId !== user.userKeyFingerprint
      )
        throw new Error('Native User enrollment scope mismatch');
      await this.state.write(JSON.stringify(['identity', userId]), {
        deviceId,
        publicIdentity: user.publicIdentity,
        recoveryConfirmed: false,
      });
      this.assertAccess();
      await this.state.write(userScope(userId, deviceId), user);
      return credential;
    });
  }
  confirmUserRecovery(
    userId: string,
    deviceId: string,
    credential: RecoveryCredential,
  ): Promise<KeyAccessIdentity> {
    return this.exclusive(async () => {
      const user = await this.user(userId, deviceId);
      await this.invoke('confirmUser', { user, credential });
      await this.state.write(JSON.stringify(['identity', userId]), {
        deviceId,
        publicIdentity: user.publicIdentity,
        recoveryConfirmed: true,
      });
      this.assertAccess();
      await this.state.write(userScope(userId, deviceId), { ...user, recoveryConfirmed: true });
      return this.identity(user);
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
        const exists = await this.hasDevice(userId, deviceId);
        if (
          marker !== null &&
          object(marker).recoveryConfirmed === false &&
          object(marker).deviceId === deviceId
        )
          return { user: 'interrupted' };
        return { user: marker !== null || exists ? 'recovery-required' : 'not-started' };
      }
      const user = await this.user(userId, deviceId);
      if (!(await this.hasDevice(userId, deviceId))) return { user: 'recovery-required' };
      await this.withUserReference(user, async () => undefined);
      const identity = this.identity(user);
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
      if (raw === null || !(await this.hasDevice(userId, deviceId))) return 'recovery-required';
      const user = await this.user(userId, deviceId);
      await this.withUserReference(user, async () => undefined);
      return user.recoveryConfirmed ? 'ready' : 'setup-incomplete';
    });
  }
  async recoverUserFromSource(
    credential: RecoveryCredential,
    source: RecoveryArtifactSource,
    deviceId: string,
  ): Promise<KeyAccessIdentity> {
    this.assertAccess();
    const saved = await source.loadUserRecoveryPackage(credential.identityId);
    this.assertAccess();
    if (saved === null)
      throw new Error('User recovery ciphertext is unavailable; retain identity and retry');
    return this.recoverUserDevice(credential, saved, deviceId);
  }
  recoverUserDevice(
    credential: RecoveryCredential,
    value: unknown,
    deviceId: string,
  ): Promise<KeyAccessIdentity> {
    return this.exclusive(async () => {
      const saved = parseUserRecoveryPackage(value);
      if (
        Object.keys(saved).sort().join(',') !==
        'format,formatVersion,publicIdentity,recoveryEnvelope,recoveryPublicKey,userId,userKeyFingerprint'
      )
        throw new Error('Unexpected User recovery field');
      let marker: unknown = null;
      try {
        marker = await this.state.read(JSON.stringify(['identity', saved.userId]));
      } catch (error) {
        if (!(error instanceof MissingKeyStateError)) throw error;
      }
      if (
        marker !== null &&
        object(marker).enrollmentPending !== true &&
        (await userIdentityFingerprint(parseUserPublicIdentity(object(marker).publicIdentity))) !==
          saved.userKeyFingerprint
      )
        throw new Error('Established User identity mismatch');
      if (!deviceId.trim()) throw new Error('Invalid replacement Device identity');
      if ((await this.state.read(userScope(saved.userId, deviceId))) !== null)
        throw new Error('Device identity already exists');
      const user = parseLocalUser(
        await this.invoke('recoverUser', { user: saved, credential, deviceId }),
      );
      if (
        user.userId !== saved.userId ||
        user.deviceId !== deviceId ||
        user.userKeyFingerprint !== saved.userKeyFingerprint
      )
        throw new Error('Native recovered User scope mismatch');
      await this.state.write(JSON.stringify(['identity', saved.userId]), {
        deviceId,
        publicIdentity: saved.publicIdentity,
        recoveryConfirmed: true,
      });
      this.assertAccess();
      await this.state.write(userScope(saved.userId, deviceId), user);
      return this.identity(user);
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
      await this.state.write(workplaceIdentityScope(identity.userId, workplaceId), {
        userKeyFingerprint: identity.userKeyFingerprint,
        recoveryConfirmed: false,
        enrollmentPending: true,
      });
      const result = await this.withUserReference(user, async key => {
        const generated = object(
          await this.crypto.generateKeys({ kind: 'workplace', user: key, workplaceId }),
        );
        await this.crypto.releaseKey(parseNativeKeyReference(generated.key));
        return generated;
      });
      const keys = parseWorkplaceKeys(result.keys),
        credential = parseRecoveryCredential(result.credential);
      if (
        keys.userId !== identity.userId ||
        keys.workplaceId !== workplaceId ||
        keys.userKeyFingerprint !== identity.userKeyFingerprint ||
        credential.identityId !== workplaceId ||
        credential.identityKeyId !== keys.keyId
      )
        throw new Error('Native Workplace enrollment scope mismatch');
      await this.state.write(workplaceIdentityScope(identity.userId, workplaceId), {
        keyId: keys.keyId,
        userKeyFingerprint: identity.userKeyFingerprint,
        recoveryConfirmed: false,
      });
      this.assertAccess();
      await this.state.write(workplaceScope(identity.userId, workplaceId), keys);
      return credential;
    });
  }
  confirmWorkplaceRecovery(
    identity: KeyAccessIdentity,
    workplaceId: string,
    credential: RecoveryCredential,
  ): Promise<void> {
    return this.exclusive(async () => {
      const user = await this.readyUser(identity),
        keys = await this.workplace(identity, workplaceId);
      await this.invoke('confirmWorkplace', { user, keys, credential });
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
  exportWorkplaceKeys(identity: KeyAccessIdentity, workplaceId: string): Promise<WorkplaceKeys> {
    return this.exclusive(async () => {
      await this.readyUser(identity);
      return this.workplace(identity, workplaceId);
    });
  }
  installWorkplaceKeys(identity: KeyAccessIdentity, value: unknown): Promise<void> {
    return this.exclusive(async () => {
      const keys = parseWorkplaceKeys(value),
        user = await this.readyUser(identity);
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
        object(marker).enrollmentPending !== true &&
        (object(marker).keyId !== keys.keyId ||
          object(marker).userKeyFingerprint !== identity.userKeyFingerprint)
      )
        throw new Error('Established Workplace identity mismatch');
      await this.withWorkplaceReference(user, keys, async () => undefined);
      await this.state.write(workplaceIdentityScope(identity.userId, keys.workplaceId), {
        keyId: keys.keyId,
        userKeyFingerprint: identity.userKeyFingerprint,
        recoveryConfirmed: true,
      });
      this.assertAccess();
      await this.state.write(
        workplaceScope(identity.userId, keys.workplaceId),
        marker === null ? keys : { ...keys, encryptionInvocations: MAX_ENCRYPTIONS },
      );
    });
  }
  signRecoveryManifest(identity: KeyAccessIdentity, digest: string): Promise<string> {
    return this.exclusive(async () => {
      if (!/^sha256:[a-f0-9]{64}$/.test(digest))
        throw new Error('Invalid recovery manifest digest');
      const user = await this.readyUser(identity),
        result = await this.withUserReference(user, key => this.crypto.sign(key, digest));
      if (typeof result !== 'string' || !/^[a-f0-9]{128}$/.test(result))
        throw new Error('Invalid native signature');
      return result;
    });
  }
  encryptSnapshot(
    identity: KeyAccessIdentity,
    workplaceId: string,
    snapshot: WorkplaceSnapshot,
  ): Promise<EncryptedSnapshot> {
    return this.exclusive(async () => {
      const user = await this.readyUser(identity),
        keys = await this.workplace(identity, workplaceId);
      if (!keys.recoveryConfirmed)
        throw new Error('Confirm and save Workplace dump recovery first');
      if (keys.writerDeviceId !== identity.registeredDeviceId)
        throw new Error('Backup writer handover is required');
      if (keys.encryptionInvocations >= MAX_ENCRYPTIONS)
        throw new Error('Workplace encryption budget exhausted');
      const reserved = { ...keys, encryptionInvocations: keys.encryptionInvocations + 1 };
      await this.state.write(workplaceScope(identity.userId, workplaceId), reserved);
      this.assertAccess();
      return parseEncryptedSnapshotEnvelope(
        await this.withWorkplaceReference(user, reserved, key =>
          this.crypto.encrypt(key, serializeWorkplaceSnapshot(snapshot)),
        ),
      );
    });
  }
  decryptSnapshot(
    identity: KeyAccessIdentity,
    workplaceId: string,
    value: unknown,
  ): Promise<WorkplaceSnapshot> {
    return this.exclusive(async () => {
      const user = await this.readyUser(identity),
        keys = await this.workplace(identity, workplaceId);
      if (!keys.recoveryConfirmed)
        throw new Error('Confirm and save Workplace dump recovery first');
      const snapshot = parseEncryptedSnapshotEnvelope(value);
      const plaintext = await this.withWorkplaceReference(user, keys, key =>
        this.crypto.decrypt(key, snapshot),
      );
      if (typeof plaintext !== 'string') throw new Error('Invalid native snapshot result');
      return decodeWorkplaceSnapshot(plaintext);
    });
  }
  async validateRecoveryCredential(
    user: UserRecoveryPackage,
    credential: RecoveryCredential,
  ): Promise<void> {
    await this.invoke('validateRecovery', { user, credential });
  }
  logout(userId: string, deviceId: string): Promise<void> {
    const next = (queues.get(this.state) ?? Promise.resolve())
      .catch(() => undefined)
      .then(async () => {
        await this.crypto.removeKey({ kind: 'device', userId, deviceId });
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
      await this.crypto.removeKey({ kind: 'device', userId, deviceId });
      await this.state.remove(userScope(userId, deviceId));
    });
  }
  discardUnconfirmedWorkplace(identity: KeyAccessIdentity, workplaceId: string): Promise<void> {
    return this.exclusive(async () => {
      await this.readyUser(identity);
      const raw = await this.state.read(workplaceScope(identity.userId, workplaceId)),
        marker = await this.state.read(workplaceIdentityScope(identity.userId, workplaceId));
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
export const localKeyHierarchy = new LocalKeyHierarchy(
  keyCiphertextStateStore,
  assertKeyAccessAllowed,
);
