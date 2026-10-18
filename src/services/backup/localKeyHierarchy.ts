import type { EncryptRow, DecryptedRow } from '@/src/services/crypto/protocol/rowCrypto';
import type { RowEnvelopeJson } from '@/src/services/crypto/protocol/envelopeJson';
import type { RowManifestFields } from '@/src/services/crypto/protocol/manifestBytes';
import { SerialQueue } from '@/src/utils/serialQueue';
import { parseObject } from '@/src/utils/strictObject';
import { MissingKeyStateError, keyOperationErrorCode } from '@/src/utils/keyOperationError';
import { keyCiphertextStateStore, type KeyCiphertextStateStore } from './keyCiphertextStateStore';
import { nativeKeyOperations } from './nativeKeyOperations';
import {
  parseNativeKeyReference,
  type NativeKeyReference,
  type NativeKeyOperations,
  type RecoveryOperation,
} from './nativeKeyApi';
import { assertKeyAccessAllowed } from './keyAccessPolicy';
import { parseRecoveryCredential, publicKeyId, type RecoveryCredential } from './keyEnvelopes';
import { parseUserPublicIdentity, userIdentityFingerprint } from './userIdentity';
import {
  parseExportedUserRecoveryPackage,
  parseLocalUser,
  parseWorkplaceKeys,
  identityScope,
  userScope,
  userRecoveryScope,
  restoreDraftScope,
  workplaceScope,
  workplaceIdentityScope,
  type KeyAccessIdentity,
  type LocalUserKeys,
  type UserRecoveryPackage,
  type WorkplaceKeys,
  type EncryptionSetupStatus,
} from './keyHierarchyRecords';

/** Workflow contract: callers request operations, never borrow private-key bytes. */
export interface KeyHierarchy {
  encryptRows(
    identity: KeyAccessIdentity,
    workplaceId: string,
    rows: readonly EncryptRow[],
  ): Promise<readonly RowEnvelopeJson[]>;
  decryptRows(
    identity: KeyAccessIdentity,
    workplaceId: string,
    envelopes: readonly RowEnvelopeJson[],
    recoveryKeys?: WorkplaceKeys,
  ): Promise<readonly DecryptedRow[]>;
  signRowManifest(identity: KeyAccessIdentity, fields: RowManifestFields): Promise<string>;
  decryptWorkplaceRecoveryRows(
    keys: WorkplaceKeys,
    credential: RecoveryCredential,
    envelopes: readonly RowEnvelopeJson[],
  ): Promise<readonly DecryptedRow[]>;

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
  recoverUserDevice(
    credential: RecoveryCredential,
    value: unknown,
    deviceId: string,
    restoreDraftId?: string,
  ): Promise<KeyAccessIdentity>;
  discardRestoreDraft(userId: string, deviceId: string, draftId: string): Promise<void>;
  commitRestoreDraft(userId: string, deviceId: string, draftId: string): Promise<void>;
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
  preflightWorkplaceRestore(
    identity: KeyAccessIdentity,
    value: unknown,
  ): Promise<'installed' | 'installable'>;
  installWorkplaceKeys(identity: KeyAccessIdentity, value: unknown): Promise<void>;
  validateRecoveryCredential(
    user: UserRecoveryPackage,
    credential: RecoveryCredential,
  ): Promise<void>;
  logout(userId: string, deviceId: string): Promise<void>;
  discardUnconfirmedUser(userId: string, deviceId: string): Promise<void>;
  discardUnconfirmedWorkplace(identity: KeyAccessIdentity, workplaceId: string): Promise<void>;
}
const queues = new WeakMap<KeyCiphertextStateStore, SerialQueue>();

type UserKeyState =
  | { user: 'missing' }
  | { user: 'recovery-required' }
  | { user: 'pending' | 'ready'; identity: KeyAccessIdentity };

/** Owns public key-state checkpoints. All secret-bearing operations execute natively. */
export class LocalKeyHierarchy implements KeyHierarchy {
  constructor(
    private readonly state: KeyCiphertextStateStore,
    private readonly assertAccess: () => void,
    private readonly crypto: NativeKeyOperations = nativeKeyOperations,
  ) {}
  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    // Shared by every hierarchy using this store; protects asynchronous read-modify-write steps.
    // A per-call native mutex cannot protect these asynchronous persistence steps.
    // Access can change during awaits; checks within operations also guard later checkpoint writes.
    return this.storeQueue().run(async () => {
      this.assertAccess();
      const result = await operation();
      this.assertAccess();
      return result;
    });
  }
  private storeQueue(): SerialQueue {
    let queue = queues.get(this.state);
    if (!queue) {
      queue = new SerialQueue();
      queues.set(this.state, queue);
    }
    return queue;
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
      // References hold ciphertext/public metadata; cleanup must not replace the operation result.
      await this.crypto.releaseKey(key).catch(() => undefined);
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
      const key = await this.crypto.openKey({
        kind: 'workplace',
        user: userKey,
        keys,
      });
      return this.withReference(key, () => operation(key));
    });
  }
  private async hasDevice(userId: string, deviceId: string): Promise<boolean> {
    this.assertAccess();
    const result = await this.crypto.hasKey({
      kind: 'device',
      userId,
      deviceId,
    });
    this.assertAccess();
    if (typeof result !== 'boolean') throw new Error('Invalid Device vault result');
    return result;
  }
  private async user(userId: string, deviceId: string): Promise<LocalUserKeys> {
    const raw = await this.state.read(userScope(userId, deviceId));
    if (raw === null) throw new Error('Enroll or recover this User and Device first');
    return this.validateUserScope(raw, userId, deviceId);
  }
  private async validateUserScope(
    raw: unknown,
    userId: string,
    deviceId: string,
  ): Promise<LocalUserKeys> {
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
      if ((await this.state.read(identityScope(userId))) !== null)
        throw new Error('Established User identity requires recovery, never a new root');
      // Public intent precedes native key creation. A killed call cannot silently regenerate the root.
      await this.state.write(identityScope(userId), {
        deviceId,
        recoveryConfirmed: false,
        enrollmentPending: true,
      });
      const device = parseNativeKeyReference(
        await this.crypto.generateKeys({ kind: 'device', userId, deviceId }),
      );
      const result = await this.withReference(device, async () => {
        const generated = parseObject(
          await this.crypto.generateKeys({ kind: 'user', device }),
          'Invalid native key result',
        );
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
      await this.state.write(identityScope(userId), {
        deviceId,
        publicIdentity: user.publicIdentity,
        recoveryConfirmed: false,
      });
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
      await this.state.write(userScope(userId, deviceId), {
        ...user,
        recoveryConfirmed: true,
      });
      await this.state.write(identityScope(userId), {
        deviceId,
        publicIdentity: user.publicIdentity,
        recoveryConfirmed: true,
      });
      return this.identity(user);
    });
  }
  /** Reads User access; describeSetup also distinguishes new and interrupted enrollment. */
  private async readUserKeyState(userId: string, deviceId: string): Promise<UserKeyState> {
    let raw: unknown;
    try {
      raw = await this.state.read(userScope(userId, deviceId));
    } catch (error) {
      if (error instanceof MissingKeyStateError) return { user: 'recovery-required' };
      throw error;
    }
    if (raw === null) return { user: 'missing' };
    try {
      if (!(await this.hasDevice(userId, deviceId))) return { user: 'recovery-required' };
      const user = await this.validateUserScope(raw, userId, deviceId);
      await this.withUserReference(user, async () => undefined);
      return {
        user: user.recoveryConfirmed ? 'ready' : 'pending',
        identity: this.identity(user),
      };
    } catch (error) {
      if (
        [
          'FFB_KEY_RECOVERY_REQUIRED',
          'FFB_KEY_AUTHENTICATION_FAILED',
          'FFB_KEY_INVALID_FILE',
        ].includes(keyOperationErrorCode(error))
      )
        return { user: 'recovery-required' };
      // A temporary vault error or app lock must remain retryable, not imply permanent key loss.
      throw error;
    }
  }
  describeSetup(
    userId: string,
    deviceId: string,
    workplaceId?: string,
  ): Promise<EncryptionSetupStatus> {
    return this.exclusive(async () => {
      const status = await this.readUserKeyState(userId, deviceId);
      if (status.user === 'missing') {
        const marker = await this.state.read(identityScope(userId));
        let exists: boolean;
        try {
          exists = await this.hasDevice(userId, deviceId);
        } catch (error) {
          if (keyOperationErrorCode(error) === 'FFB_KEY_RECOVERY_REQUIRED')
            return { user: 'recovery-required' };
          throw error;
        }
        if (
          marker !== null &&
          parseObject(marker, 'Invalid native key result').recoveryConfirmed === false &&
          parseObject(marker, 'Invalid native key result').deviceId === deviceId
        )
          return { user: 'interrupted' };
        return {
          user: marker !== null || exists ? 'recovery-required' : 'not-started',
        };
      }
      if (status.user !== 'ready' || !workplaceId) return status;
      const { identity } = status;
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
              : parseObject(marker, 'Invalid native key result').recoveryConfirmed === false
                ? 'interrupted'
                : 'recovery-required',
        };
      }
      const keys = await this.workplace(identity, workplaceId);
      return {
        user: 'ready',
        identity,
        workplace: keys.recoveryConfirmed ? 'ready' : 'pending',
      };
    });
  }
  recoverUserDevice(
    credential: RecoveryCredential,
    value: unknown,
    deviceId: string,
    restoreDraftId?: string,
  ): Promise<KeyAccessIdentity> {
    return this.exclusive(async () => {
      const saved = parseExportedUserRecoveryPackage(value);
      let marker: unknown = null;
      try {
        marker = await this.state.read(identityScope(saved.userId));
      } catch (error) {
        if (!(error instanceof MissingKeyStateError)) throw error;
      }
      if (
        marker !== null &&
        parseObject(marker, 'Invalid native key result').enrollmentPending !== true &&
        (await userIdentityFingerprint(
          parseUserPublicIdentity(parseObject(marker, 'Invalid native key result').publicIdentity),
        )) !== saved.userKeyFingerprint
      )
        throw new Error('Established User identity mismatch');
      if (!deviceId.trim()) throw new Error('Invalid replacement Device identity');
      const draftScope = restoreDraftId ? restoreDraftScope(restoreDraftId) : null;
      // Authenticate on retries too; a draft marker proves ownership, not current credential validity.
      await this.invoke('validateRecovery', { user: saved, credential });
      const existingUser = await this.state.read(userScope(saved.userId, deviceId));
      if (existingUser !== null) {
        if (!draftScope) throw new Error('Device identity already exists');
        const draft = await this.state.read(draftScope);
        const marker =
          draft === null ? null : parseObject(draft, 'Invalid encrypted restore draft');
        const existing = parseLocalUser(existingUser);
        if (
          marker?.userId !== saved.userId ||
          marker?.deviceId !== deviceId ||
          marker?.userKeyFingerprint !== saved.userKeyFingerprint ||
          existing.userKeyFingerprint !== saved.userKeyFingerprint
        )
          throw new Error('Encrypted restore draft does not match the recovered User');
        return this.identity(existing);
      }
      // Authenticate before recording trust or removing a key left by an interrupted attempt.
      let previousIdentity: unknown = null;
      if (draftScope) {
        const existingDraft = await this.state.read(draftScope);
        if (existingDraft !== null) {
          const draft = parseObject(existingDraft, 'Invalid encrypted restore draft');
          if (
            draft.userId !== saved.userId ||
            draft.deviceId !== deviceId ||
            draft.userKeyFingerprint !== saved.userKeyFingerprint
          )
            throw new Error('Encrypted restore draft scope mismatch');
          previousIdentity = draft.previousIdentity;
        } else {
          previousIdentity = await this.state.read(identityScope(saved.userId));
          await this.state.write(draftScope, {
            userId: saved.userId,
            deviceId,
            userKeyFingerprint: saved.userKeyFingerprint,
            previousIdentity,
          });
        }
      }
      const recoveryScope = userRecoveryScope(saved.userId, deviceId);
      const pending = await this.state.read(recoveryScope);
      if (pending === null) {
        if (await this.hasDevice(saved.userId, deviceId))
          throw new Error('Device identity already exists');
        // Only keys created AFTER this checkpoint belong to this recovery attempt.
        await this.state.write(recoveryScope, {
          userKeyFingerprint: saved.userKeyFingerprint,
        });
      } else {
        if (
          parseObject(pending, 'Invalid User recovery intent').userKeyFingerprint !==
          saved.userKeyFingerprint
        )
          throw new Error('Pending User recovery identity mismatch');
        // No User record was published, so this scoped key has no established local binding.
        // Removing it is safe even after process death or an ambiguous native result.
        await this.crypto.removeKey({ kind: 'device', userId: saved.userId, deviceId });
      }
      // Pin the authenticated root before native recovery. A failed User-record write must
      // neither block a retry nor permit a different root to claim this User UUID.
      await this.state.write(identityScope(saved.userId), {
        deviceId,
        publicIdentity: saved.publicIdentity,
        recoveryConfirmed: true,
      });
      const user = parseLocalUser(
        await this.invoke('recoverUser', { user: saved, credential, deviceId }),
      );
      if (
        user.userId !== saved.userId ||
        user.deviceId !== deviceId ||
        user.userKeyFingerprint !== saved.userKeyFingerprint
      )
        throw new Error('Native recovered User scope mismatch');
      await this.state.write(userScope(saved.userId, deviceId), user);
      await this.state.remove(recoveryScope);
      return this.identity(user);
    });
  }
  discardRestoreDraft(userId: string, deviceId: string, draftId: string): Promise<void> {
    return this.exclusive(async () => {
      const scope = restoreDraftScope(draftId);
      const raw = await this.state.read(scope);
      if (raw === null) return;
      const draft = parseObject(raw, 'Invalid encrypted restore draft');
      if (draft.userId !== userId || draft.deviceId !== deviceId)
        throw new Error('Encrypted restore draft scope mismatch');
      // Keep the marker until native removal and checkpoint cleanup succeed so discard is retryable.
      await this.crypto.removeKey({ kind: 'device', userId, deviceId });
      await this.state.remove(userScope(userId, deviceId));
      await this.state.remove(userRecoveryScope(userId, deviceId));
      const currentIdentity = await this.state.read(identityScope(userId));
      if (
        currentIdentity !== null &&
        parseObject(currentIdentity, 'Invalid native key result').deviceId === deviceId
      ) {
        if (draft.previousIdentity === null) await this.state.remove(identityScope(userId));
        else await this.state.write(identityScope(userId), draft.previousIdentity);
      }
      await this.state.remove(scope);
    });
  }
  commitRestoreDraft(userId: string, deviceId: string, draftId: string): Promise<void> {
    return this.exclusive(async () => {
      const scope = restoreDraftScope(draftId);
      const raw = await this.state.read(scope);
      if (raw === null) return;
      const draft = parseObject(raw, 'Invalid encrypted restore draft');
      if (draft.userId !== userId || draft.deviceId !== deviceId)
        throw new Error('Encrypted restore draft scope mismatch');
      await this.state.remove(scope);
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
        const generated = parseObject(
          await this.crypto.generateKeys({
            kind: 'workplace',
            user: key,
            workplaceId,
          }),
          'Invalid native key result',
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
      await this.state.write(workplaceScope(identity.userId, workplaceId), {
        ...keys,
        recoveryConfirmed: true,
      });
      await this.state.write(workplaceIdentityScope(identity.userId, workplaceId), {
        keyId: keys.keyId,
        userKeyFingerprint: identity.userKeyFingerprint,
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
  encryptRows(
    identity: KeyAccessIdentity,
    workplaceId: string,
    rows: readonly EncryptRow[],
  ): Promise<readonly RowEnvelopeJson[]> {
    return this.exclusive(async () => {
      const user = await this.readyUser(identity),
        keys = await this.workplace(identity, workplaceId);
      if (!keys.recoveryConfirmed) throw new Error('Confirm Workplace recovery first');
      return this.withWorkplaceReference(user, keys, key =>
        this.crypto.encryptRows(key, workplaceId, keys.keyId, rows),
      );
    });
  }
  decryptRows(
    identity: KeyAccessIdentity,
    workplaceId: string,
    envelopes: readonly RowEnvelopeJson[],
    recoveryKeys?: WorkplaceKeys,
  ): Promise<readonly DecryptedRow[]> {
    return this.exclusive(async () => {
      const user = await this.readyUser(identity);
      // Recovery validates ciphertext before establishing any durable Workplace trust.
      const keys =
        recoveryKeys === undefined
          ? await this.workplace(identity, workplaceId)
          : parseWorkplaceKeys(recoveryKeys);
      if (
        keys.workplaceId !== workplaceId ||
        keys.userId !== identity.userId ||
        keys.userKeyFingerprint !== identity.userKeyFingerprint ||
        !keys.recoveryConfirmed
      )
        throw new Error('Workplace member identity mismatch');
      return this.withWorkplaceReference(user, keys, key =>
        this.crypto.decryptRows(key, workplaceId, envelopes),
      );
    });
  }
  signRowManifest(identity: KeyAccessIdentity, fields: RowManifestFields): Promise<string> {
    return this.exclusive(async () => {
      const user = await this.readyUser(identity);
      if (
        fields.authorUserId !== identity.userId ||
        fields.authorDeviceId !== identity.registeredDeviceId
      )
        throw new Error('Manifest author identity mismatch');
      return this.withUserReference(user, key => this.crypto.signRowManifest(key, fields));
    });
  }
  /** Read-only emergency access: never installs source keys, a User or a Device. */
  decryptWorkplaceRecoveryRows(
    value: WorkplaceKeys,
    credentialValue: RecoveryCredential,
    envelopes: readonly RowEnvelopeJson[],
  ): Promise<readonly DecryptedRow[]> {
    return this.exclusive(async () => {
      const keys = parseWorkplaceKeys(value);
      const credential = parseRecoveryCredential(credentialValue);
      if (
        credential.purpose !== 'workplace-dump' ||
        credential.identityId !== keys.workplaceId ||
        credential.identityKeyId !== keys.keyId
      )
        throw new Error('Workplace recovery file does not match the backup');
      const key = await this.crypto.openKey({ kind: 'workplace-recovery', keys, credential });
      return this.withReference(key, () =>
        this.crypto.decryptRows(key, keys.workplaceId, envelopes),
      );
    });
  }
  exportWorkplaceKeys(identity: KeyAccessIdentity, workplaceId: string): Promise<WorkplaceKeys> {
    return this.exclusive(async () => {
      await this.readyUser(identity);
      return this.workplace(identity, workplaceId);
    });
  }
  private assertRestoredWorkplaceScope(identity: KeyAccessIdentity, keys: WorkplaceKeys): void {
    if (
      keys.userId !== identity.userId ||
      keys.userKeyFingerprint !== identity.userKeyFingerprint ||
      !keys.recoveryConfirmed
    )
      throw new Error('Workplace member identity mismatch');
  }
  private async restoredWorkplaceKeyState(
    identity: KeyAccessIdentity,
    keys: WorkplaceKeys,
  ): Promise<'installed' | 'installable'> {
    let existing: unknown = null;
    try {
      existing = await this.state.read(workplaceScope(identity.userId, keys.workplaceId));
    } catch (error) {
      if (!(error instanceof MissingKeyStateError)) throw error;
    }
    if (existing !== null) {
      const installed = parseWorkplaceKeys(existing);
      if (
        installed.userId !== identity.userId ||
        installed.userKeyFingerprint !== identity.userKeyFingerprint ||
        installed.workplaceId !== keys.workplaceId ||
        installed.keyId !== keys.keyId ||
        !installed.recoveryConfirmed
      )
        throw new Error('Installed Workplace key does not match the backup');
      return 'installed';
    }
    const marker = await this.state.read(workplaceIdentityScope(identity.userId, keys.workplaceId));
    if (
      marker !== null &&
      parseObject(marker, 'Invalid native key result').enrollmentPending !== true &&
      (parseObject(marker, 'Invalid native key result').keyId !== keys.keyId ||
        parseObject(marker, 'Invalid native key result').userKeyFingerprint !==
          identity.userKeyFingerprint)
    )
      throw new Error('Established Workplace identity mismatch');
    return 'installable';
  }
  /** Read-only admission check. Must run before publishing restored database rows. */
  preflightWorkplaceRestore(
    identity: KeyAccessIdentity,
    value: unknown,
  ): Promise<'installed' | 'installable'> {
    return this.exclusive(async () => {
      const keys = parseWorkplaceKeys(value);
      this.assertRestoredWorkplaceScope(identity, keys);
      const user = await this.readyUser(identity);
      const state = await this.restoredWorkplaceKeyState(identity, keys);
      if (state === 'installable')
        await this.withWorkplaceReference(user, keys, async () => undefined);
      return state;
    });
  }
  installWorkplaceKeys(identity: KeyAccessIdentity, value: unknown): Promise<void> {
    return this.exclusive(async () => {
      const keys = parseWorkplaceKeys(value),
        user = await this.readyUser(identity);
      this.assertRestoredWorkplaceScope(identity, keys);
      if ((await this.restoredWorkplaceKeyState(identity, keys)) === 'installed')
        throw new Error('Workplace key already exists; implicit replacement is forbidden');
      await this.withWorkplaceReference(user, keys, async () => undefined);
      await this.state.write(workplaceScope(identity.userId, keys.workplaceId), keys);
      await this.state.write(workplaceIdentityScope(identity.userId, keys.workplaceId), {
        keyId: keys.keyId,
        userKeyFingerprint: identity.userKeyFingerprint,
        recoveryConfirmed: true,
      });
    });
  }
  async validateRecoveryCredential(
    user: UserRecoveryPackage,
    credential: RecoveryCredential,
  ): Promise<void> {
    await this.invoke('validateRecovery', { user, credential });
  }
  logout(userId: string, deviceId: string): Promise<void> {
    // Removing access must remain possible while locked, on the same store queue.
    return this.storeQueue().run(async () => {
      await this.crypto.removeKey({ kind: 'device', userId, deviceId });
      await this.state.remove(userScope(userId, deviceId));
      await this.state.remove(userRecoveryScope(userId, deviceId));
    });
  }
  discardUnconfirmedUser(userId: string, deviceId: string): Promise<void> {
    return this.exclusive(async () => {
      const raw = await this.state.read(userScope(userId, deviceId));
      if (raw !== null && parseLocalUser(raw).recoveryConfirmed)
        throw new Error('Cannot discard an established User identity');
      const marker = await this.state.read(identityScope(userId));
      // Enrollment writes this pending marker before creating any vault key or User record.
      if (marker === null) {
        if (raw === null) return;
        throw new Error('Cannot discard a User record without its enrollment marker');
      }
      const pending = parseObject(marker, 'Invalid native key result');
      if (pending.deviceId !== deviceId || pending.recoveryConfirmed !== false)
        throw new Error('Cannot discard an established User identity');
      // The marker goes last so an interrupted discard remains retryable.
      await this.crypto.removeKey({ kind: 'device', userId, deviceId });
      await this.state.remove(userScope(userId, deviceId));
      await this.state.remove(identityScope(userId));
    });
  }
  discardUnconfirmedWorkplace(identity: KeyAccessIdentity, workplaceId: string): Promise<void> {
    return this.exclusive(async () => {
      await this.readyUser(identity);
      const raw = await this.state.read(workplaceScope(identity.userId, workplaceId)),
        marker = await this.state.read(workplaceIdentityScope(identity.userId, workplaceId));
      if (raw === null && marker === null) return;
      if (
        raw === null &&
        marker !== null &&
        parseObject(marker, 'Invalid native key result').recoveryConfirmed === false
      ) {
        await this.state.remove(workplaceIdentityScope(identity.userId, workplaceId));
        return;
      }
      const keys = await this.workplace(identity, workplaceId);
      if (keys.recoveryConfirmed) throw new Error('Cannot discard an established Workplace key');
      if (
        marker !== null &&
        parseObject(marker, 'Invalid native key result').recoveryConfirmed !== false
      )
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
