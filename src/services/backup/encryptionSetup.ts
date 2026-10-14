import { completeRecoveredWorkplaceSetup } from '@/src/services/setup/recoveryCompletion';
import { readSetupDraftSnapshot } from '@/src/services/setup/launchProjection';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { resolveRecoverySession, completeWorkplaceRecovery } from './recoverySession';
import { SerialQueue } from '@/src/utils/serialQueue';
import { type KeyHierarchy, localKeyHierarchy } from './localKeyHierarchy';
import { type KeyAccessIdentity, type EncryptionSetupStatus } from './keyHierarchyRecords';
import {
  encryptionSetupStore,
  type EncryptionSetupStore,
  type EncryptionSetupSession,
} from './encryptionSetupStore';
import {
  createLocalRecoveryPackage,
  verifyLocalRecoveryPackage,
  type LocalRecoveryPackage,
} from './localRecoveryPackage';
import { parseRecoveryCredential, type RecoveryCredential } from './keyEnvelopes';
import { snapshotCrypto } from './snapshotCryptoProvider';
import { keyHex } from './keyEncoding';
import { snapshotFingerprint } from './encryptedSnapshot';
import {
  captureWorkplaceSnapshot,
  workplaceSnapshotFingerprint,
  type WorkplaceSnapshot,
} from './workplaceSnapshot';
import {
  recoverWorkplaceSnapshot,
  assertWorkplaceRecoveryTarget,
} from '@/src/services/import/restoreWorkplaceSnapshot';
import { asWorkplaceId } from '@/src/types/ids';
import { assertKeyAccessAllowed } from './keyAccessPolicy';
import { KeyOperationError, assertKeyOperationActive } from '@/src/utils/keyOperationError';

function freshId(): string {
  const bytes = snapshotCrypto.randomBytes(16);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = keyHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export interface SetupViewState {
  session: EncryptionSetupSession | null;
  keys: EncryptionSetupStatus | null;
  packageReady: boolean;
  packageSaved: boolean;
}
type Publication = Awaited<ReturnType<typeof recoverWorkplaceSnapshot>>;
/** Human workflow over the existing hierarchy. Durable checkpoints contain no recovery secret. */
export class EncryptionSetup {
  private readonly queue = new SerialQueue();
  constructor(
    private readonly hierarchy: KeyHierarchy,
    private readonly store: EncryptionSetupStore,
    private readonly assertAccess: () => void,
    private readonly capture: (workplaceId: string) => Promise<WorkplaceSnapshot>,
    private readonly publish: typeof recoverWorkplaceSnapshot,
    private readonly checkTarget = assertWorkplaceRecoveryTarget,
  ) {}
  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    // Serializes whole workflows/checkpoints across several hierarchy calls.
    // The hierarchy queue protects individual store operations; native locks cannot span awaits.
    return this.queue.run(async () => {
      this.assertAccess();
      return operation();
    });
  }
  private async session(): Promise<EncryptionSetupSession> {
    const saved = await this.store.loadSession();
    if (!saved) throw new Error('Start setup or recover your User first');
    return saved;
  }
  private async ready(workplaceId?: string): Promise<{
    session: EncryptionSetupSession;
    identity: KeyAccessIdentity;
    keys: EncryptionSetupStatus;
  }> {
    const session = await this.session();
    const keys = await this.hierarchy.describeSetup(session.userId, session.deviceId, workplaceId);
    if (keys.user !== 'ready' || !keys.identity)
      throw new Error('Verify your saved User recovery file first');
    if (
      session.userKeyFingerprint &&
      session.userKeyFingerprint !== keys.identity.userKeyFingerprint
    )
      throw new KeyOperationError(
        'FFB_KEY_IDENTITY_MISMATCH',
        'Established User identity mismatch',
      );
    return { session, identity: keys.identity, keys };
  }
  inspect(workplaceId?: string): Promise<SetupViewState> {
    return this.exclusive(async () => {
      const session = await this.store.loadSession();
      let keys = session
        ? await this.hierarchy.describeSetup(session.userId, session.deviceId, workplaceId)
        : null;
      if (
        keys?.user === 'not-started' &&
        (session?.intent === 'recover-user' || session?.userKeyFingerprint)
      )
        keys = { user: 'recovery-required' };
      const packageReady =
        !!session?.package && (!workplaceId || session.package.workplaceId === workplaceId);
      return {
        session,
        keys,
        packageReady,
        packageSaved: packageReady && session?.package?.confirmed === true,
      };
    });
  }
  beginUser(): Promise<RecoveryCredential> {
    return this.exclusive(async () => {
      let session = await this.store.loadSession();
      if (!session) {
        session = {
          formatVersion: 1,
          intent: 'create-user',
          userId: freshId(),
          deviceId: freshId(),
        };
        await this.store.saveSession(session); // Save IDs BEFORE creating anything; interruptions resume the same attempt.
      }
      if (session.intent !== 'create-user' || session.userKeyFingerprint)
        throw new Error('Existing User keys require recovery; a new root cannot replace them');
      const credential = await this.hierarchy.beginUser(session.userId, session.deviceId);
      this.assertAccess();
      await this.store.saveSession({ ...session, userKeyFingerprint: credential.identityKeyId });
      return credential;
    });
  }
  confirmUser(value: unknown): Promise<void> {
    return this.exclusive(async () => {
      const credential = parseRecoveryCredential(value);
      const session = await this.session();
      const identity = await this.hierarchy.confirmUserRecovery(
        session.userId,
        session.deviceId,
        credential,
      );
      this.assertAccess();
      await this.store.saveSession({ ...session, userKeyFingerprint: identity.userKeyFingerprint });
    });
  }
  beginWorkplace(workplaceId: string): Promise<RecoveryCredential> {
    return this.exclusive(async () => {
      const { session, identity } = await this.ready(workplaceId);
      await this.store.saveSession({
        ...session,
        enrolledWorkplaces: [...new Set([...(session.enrolledWorkplaces ?? []), workplaceId])],
      });
      return this.hierarchy.enrollWorkplace(identity, workplaceId, 'local-upgrade');
    });
  }
  confirmWorkplace(workplaceId: string, value: unknown): Promise<void> {
    return this.exclusive(async () => {
      const { session, identity } = await this.ready(workplaceId);
      const keys = await this.hierarchy.exportWorkplaceKeys(identity, workplaceId);
      if (keys.writerDeviceId !== identity.registeredDeviceId)
        throw new Error('Use User recovery to finish imported Workplace keys');
      await this.hierarchy.confirmWorkplaceRecovery(
        identity,
        workplaceId,
        parseRecoveryCredential(value),
      );
      this.assertAccess();
      // Explicit verification supersedes this Workplace's failed recovery.
      const next = completeWorkplaceRecovery(session, workplaceId, keys.keyId);
      await this.store.saveSession(next);
    });
  }
  discardUnfinished(workplaceId?: string): Promise<void> {
    return this.exclusive(async () => {
      const session = await this.session();
      const status = await this.hierarchy.describeSetup(
        session.userId,
        session.deviceId,
        workplaceId,
      );
      if (
        status.user === 'not-started' ||
        status.user === 'pending' ||
        status.user === 'interrupted'
      ) {
        if (session.intent !== 'create-user')
          throw new Error('Known User recovery cannot be discarded');
        await this.hierarchy.discardUnconfirmedUser(session.userId, session.deviceId);
        await this.store.saveSession({
          formatVersion: 1,
          intent: 'create-user',
          userId: session.userId,
          deviceId: session.deviceId,
        });
      } else if (
        status.identity &&
        workplaceId &&
        (status.workplace === 'pending' ||
          status.workplace === 'interrupted' ||
          (status.workplace === 'missing' &&
            !session.verifiedWorkplaces?.some(binding => binding.workplaceId === workplaceId)))
      ) {
        await this.hierarchy.discardUnconfirmedWorkplace(status.identity, workplaceId);
        await this.store.saveSession({
          ...session,
          enrolledWorkplaces: session.enrolledWorkplaces?.filter(id => id !== workplaceId),
        });
      } else throw new Error('An established identity or key cannot be discarded');
    });
  }
  preparePackage(workplaceId: string): Promise<LocalRecoveryPackage> {
    return this.exclusive(async () => {
      const { session, identity, keys } = await this.ready(workplaceId);
      if (keys.workplace !== 'ready') throw new Error('Verify your Workplace recovery file first');
      // Resume an unconfirmed export with identical ciphertext and invocation usage.
      if (session.package?.workplaceId === workplaceId && !session.package.confirmed)
        return verifyLocalRecoveryPackage(await this.store.readPackage(session.package), identity);
      const snapshot = await this.capture(workplaceId);
      this.assertAccess();
      const encrypted = await this.hierarchy.encryptSnapshot(identity, workplaceId, snapshot);
      const value = await createLocalRecoveryPackage(
        this.hierarchy,
        identity,
        workplaceId,
        encrypted,
      );
      this.assertAccess();
      const reference = await this.store.writePackage(value);
      this.assertAccess();
      await this.store.saveSession({ ...session, package: reference });
      return value;
    });
  }
  savedPackage(): Promise<LocalRecoveryPackage> {
    return this.exclusive(async () => {
      const session = await this.session();
      if (!session.package) throw new Error('Prepare an encrypted package first');
      if (!session.userKeyFingerprint) throw new Error('The recovery identity is not confirmed');
      const identity = { userId: session.userId, userKeyFingerprint: session.userKeyFingerprint };
      return verifyLocalRecoveryPackage(await this.store.readPackage(session.package), identity);
    });
  }
  abandonPendingPackage(workplaceId: string): Promise<void> {
    return this.exclusive(async () => {
      const { session, keys } = await this.ready(workplaceId);
      if (
        !session.package ||
        session.package.workplaceId !== workplaceId ||
        session.package.confirmed
      )
        throw new Error('No unfinished package for this Workplace');
      if (!keys.writerAllowed) throw new Error('This Device cannot create a replacement backup');
      const next = { ...session };
      delete next.package;
      this.assertAccess();
      // Do not read the missing file, replace keys, or reclaim its encryption invocation.
      await this.store.saveSession(next);
    });
  }
  forgetDevice(): Promise<void> {
    return this.exclusive(async () => {
      const session = await this.session();
      const enrolled = session.enrolledWorkplaces ?? [];
      if (
        !session.package?.confirmed ||
        enrolled.length === 0 ||
        session.pendingRecoveries?.length ||
        enrolled.some(
          id =>
            !session.verifiedWorkplaces?.some(
              binding => binding.workplaceId === id && binding.savedPackageFingerprint,
            ),
        )
      )
        throw new KeyOperationError(
          'FFB_KEY_BACKUPS_REQUIRED',
          'Verify saved packages for every enrolled Workplace before removing access',
        );
      await this.hierarchy.logout(session.userId, session.deviceId);
      await this.store.saveSession({ ...session, intent: 'recover-user' });
    });
  }
  confirmPackage(value: unknown): Promise<void> {
    return this.exclusive(async () => {
      const { session, identity } = await this.ready();
      if (!session.package) throw new Error('Prepare an encrypted package first');
      const saved = await verifyLocalRecoveryPackage(value, identity);
      if ((await snapshotFingerprint(JSON.stringify(saved))) !== session.package.fingerprint)
        throw new KeyOperationError(
          'FFB_KEY_PACKAGE_MISMATCH',
          'Choose the encrypted package you just saved',
        );
      // Read back actual data, not merely the export sheet's successful return.
      await this.hierarchy.decryptSnapshot(
        identity,
        saved.workplaceKeys.workplaceId,
        saved.snapshot,
      );
      this.assertAccess();
      await this.store.saveSession({
        ...session,
        package: { ...session.package, confirmed: true },
        verifiedWorkplaces: session.verifiedWorkplaces?.map(binding =>
          binding.workplaceId === saved.workplaceKeys.workplaceId
            ? { ...binding, savedPackageFingerprint: session.package!.fingerprint }
            : binding,
        ),
      });
    });
  }
  /** Completes already-published books without opening any key or requiring an unlocked screen. */
  finishRecoveryCompletion(): Promise<void> {
    return this.queue.run(() => this.finishPendingCompletion());
  }
  private async finishPendingCompletion(saved?: EncryptionSetupSession): Promise<void> {
    const session = saved ?? (await this.store.loadSession());
    const completion = session?.pendingCompletion;
    if (!session || !completion) return;
    const existing = await workplaceRepository.find(completion.publication.workplaceId);
    if (
      !existing ||
      (completion.publication.kind === 'restored' &&
        existing.snapshotRestoreFingerprint !== completion.snapshotFingerprint)
    )
      return;
    const currentDraft = readSetupDraftSnapshot();
    const currentFingerprint =
      currentDraft === undefined ? undefined : await snapshotFingerprint(currentDraft);
    completeRecoveredWorkplaceSetup(
      completion.publication,
      currentFingerprint === completion.setupDraftFingerprint ? currentDraft : undefined,
      completion.id,
    );
    const next = { ...session };
    delete next.pendingCompletion;
    await this.store.saveSession(next);
  }
  private async readRecoverySession(credential: RecoveryCredential): Promise<{
    session: EncryptionSetupSession | null;
    existing: EncryptionSetupStatus | null;
  }> {
    let session = await this.store.loadSession();
    if (
      session &&
      (session.userId !== credential.identityId ||
        (session.userKeyFingerprint && session.userKeyFingerprint !== credential.identityKeyId))
    ) {
      const vacantCreation =
        session.intent === 'create-user' &&
        !session.userKeyFingerprint &&
        (await this.hierarchy.describeSetup(session.userId, session.deviceId)).user ===
          'not-started';
      if (!vacantCreation)
        throw new KeyOperationError(
          'FFB_KEY_IDENTITY_MISMATCH',
          'This Device is set up for a different User; use a fresh installation',
        );
      session = null;
    }
    const existing = session
      ? await this.hierarchy.describeSetup(session.userId, session.deviceId)
      : null;
    return { session, existing };
  }
  recover(value: unknown, secret: unknown, signal?: AbortSignal): Promise<Publication> {
    return this.exclusive(async () => {
      assertKeyOperationActive(signal);
      const setupDraft = readSetupDraftSnapshot();
      const setupDraftFingerprint =
        setupDraft === undefined ? undefined : await snapshotFingerprint(setupDraft);
      const credential = parseRecoveryCredential(secret);
      if (credential.purpose !== 'user-recovery')
        throw new KeyOperationError('FFB_KEY_INVALID_FILE', 'Choose your User recovery file');
      const saved = await verifyLocalRecoveryPackage(value, {
        userId: credential.identityId,
        userKeyFingerprint: credential.identityKeyId,
      });
      await this.hierarchy.validateRecoveryCredential(saved.userRecoveryPackage, credential);
      this.assertAccess();
      assertKeyOperationActive(signal);
      const observed = await this.readRecoverySession(credential);
      if (observed.session?.pendingCompletion) {
        await this.finishPendingCompletion(observed.session);
        observed.session = await this.store.loadSession();
      }
      const { existing } = observed;
      const { workplaceId, keyId } = saved.workplaceKeys;
      const { session, preserveExistingBooks } = resolveRecoverySession({
        ...observed,
        credential,
        workplaceKeys: saved.workplaceKeys,
        deviceId: existing?.user === 'ready' ? observed.session!.deviceId : freshId(),
      });
      // Persist the preservation decision before reconstructing keys or rejecting local books.
      this.assertAccess();
      assertKeyOperationActive(signal);
      await this.store.saveSession(session);
      this.assertAccess();
      assertKeyOperationActive(signal);
      let identity: KeyAccessIdentity;
      if (existing?.user === 'ready' && existing.identity) {
        await this.hierarchy.confirmUserRecovery(
          existing.identity.userId,
          existing.identity.registeredDeviceId,
          credential,
        );
        identity = existing.identity;
      } else {
        identity = await this.hierarchy.recoverUserDevice(
          credential,
          saved.userRecoveryPackage,
          session.deviceId,
        );
      }
      assertKeyOperationActive(signal);
      const status = await this.hierarchy.describeSetup(
        identity.userId,
        identity.registeredDeviceId,
        workplaceId,
      );
      await this.checkTarget(workplaceId, preserveExistingBooks);
      this.assertAccess();
      assertKeyOperationActive(signal);
      if (status.workplace === 'missing' || status.workplace === 'recovery-required')
        await this.hierarchy.installWorkplaceKeys(identity, saved.workplaceKeys);
      else {
        const current = await this.hierarchy.exportWorkplaceKeys(
          identity,
          saved.workplaceKeys.workplaceId,
        );
        if (!current.recoveryConfirmed || current.keyId !== saved.workplaceKeys.keyId)
          throw new KeyOperationError(
            'FFB_KEY_IDENTITY_MISMATCH',
            'Existing Workplace key differs',
          );
      }
      const snapshot = await this.hierarchy.decryptSnapshot(
        identity,
        saved.workplaceKeys.workplaceId,
        saved.snapshot,
      );
      this.assertAccess();
      assertKeyOperationActive(signal);
      const fingerprint = await workplaceSnapshotFingerprint(snapshot);
      const completionId = keyHex(snapshotCrypto.randomBytes(16));
      if (!preserveExistingBooks || !(await workplaceRepository.find(asWorkplaceId(workplaceId)))) {
        // Persist the nonsecret completion handoff before the database can commit.
        // On restart it is applied only if that exact snapshot has a committed receipt.
        await this.store.saveSession({
          ...session,
          pendingCompletion: {
            id: completionId,
            publication: {
              kind: 'restored',
              workplaceId: asWorkplaceId(workplaceId),
              bookPreferences: snapshot.bookPreferences,
            },
            snapshotFingerprint: fingerprint,
            setupDraftFingerprint,
          },
        });
      }
      this.assertAccess();
      assertKeyOperationActive(signal);
      const result = await this.publish(snapshot, { preserveExistingBooks, signal });
      completeRecoveredWorkplaceSetup(result, setupDraft, completionId);
      // Publication is committed. Finish public bookkeeping even after lock/background.
      // A killed process before this checkpoint retries through the DB restore receipt.
      const reference = await this.store.writePackage(saved);
      const completed = completeWorkplaceRecovery(session, workplaceId, keyId);
      const next: EncryptionSetupSession = {
        ...completed,
        verifiedWorkplaces: completed.verifiedWorkplaces?.map(binding =>
          binding.workplaceId === workplaceId
            ? { ...binding, savedPackageFingerprint: reference.fingerprint }
            : binding,
        ),
        package: { ...reference, confirmed: true },
        pendingCompletion: {
          id: completionId,
          publication: result,
          snapshotFingerprint: fingerprint,
          setupDraftFingerprint,
        },
      };
      await this.store.saveSession(next);
      return result;
    });
  }
}

export const encryptionSetup = new EncryptionSetup(
  localKeyHierarchy,
  encryptionSetupStore,
  assertKeyAccessAllowed,
  workplaceId => captureWorkplaceSnapshot(asWorkplaceId(workplaceId)),
  recoverWorkplaceSnapshot,
);
