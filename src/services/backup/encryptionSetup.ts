import {
  LocalKeyHierarchy,
  localKeyHierarchy,
  type KeyAccessIdentity,
  type EncryptionSetupStatus,
} from './localKeyHierarchy';
import {
  encryptionSetupStore,
  type EncryptionSetupStore,
  type EncryptionSetupSession,
} from './encryptionSetupStore';
import {
  createLocalRecoveryPackage,
  verifyLocalRecoveryPackage,
  validatePackageCredential,
  parseRecoveryCredential,
  type LocalRecoveryPackage,
} from './localRecoveryPackage';
import { snapshotCrypto } from './snapshotCryptoProvider';
import { keyHex } from './keyEncoding';
import {
  encryptWorkplaceSnapshot,
  decryptWorkplaceSnapshot,
  snapshotFingerprint,
} from './encryptedSnapshot';
import { captureWorkplaceSnapshot, type WorkplaceSnapshot } from './workplaceSnapshot';
import { recoverWorkplaceSnapshot } from '@/src/services/import/restoreWorkplaceSnapshot';
import { asWorkplaceId } from '@/src/types/ids';
import { assertKeyAccessAllowed } from './keyAccessPolicy';
import type { RecoveryCredential } from './keyEnvelopes';

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
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly hierarchy: LocalKeyHierarchy,
    private readonly store: EncryptionSetupStore,
    private readonly assertAccess: () => void,
    private readonly capture: (workplaceId: string) => Promise<WorkplaceSnapshot>,
    private readonly publish: typeof recoverWorkplaceSnapshot,
  ) {}
  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue
      .catch(() => undefined)
      .then(async () => {
        this.assertAccess();
        return operation();
      });
    this.queue = next.catch(() => undefined);
    return next;
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
      throw new Error('Established User identity mismatch');
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
      const { identity } = await this.ready(workplaceId);
      return this.hierarchy.enrollWorkplace(identity, workplaceId, 'local-upgrade');
    });
  }
  confirmWorkplace(workplaceId: string, value: unknown): Promise<void> {
    return this.exclusive(async () => {
      const { identity } = await this.ready(workplaceId);
      await this.hierarchy.confirmWorkplaceRecovery(
        identity,
        workplaceId,
        parseRecoveryCredential(value),
      );
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
        (status.workplace === 'pending' || status.workplace === 'interrupted')
      ) {
        await this.hierarchy.discardUnconfirmedWorkplace(status.identity, workplaceId);
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
      const encrypted = await this.hierarchy.withWorkplaceKey(
        identity,
        workplaceId,
        dek => encryptWorkplaceSnapshot(snapshot, dek),
        true,
      );
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
      if (!session.package?.confirmed)
        throw new Error('Verify a saved encrypted package before removing access');
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
        throw new Error('Choose the encrypted package you just saved');
      // Read back actual data, not merely the export sheet's successful return.
      await this.hierarchy.withWorkplaceKey(identity, saved.workplaceKeys.workplaceId, dek =>
        decryptWorkplaceSnapshot(saved.snapshot, dek),
      );
      this.assertAccess();
      await this.store.saveSession({
        ...session,
        package: { ...session.package, confirmed: true },
      });
    });
  }
  recover(
    value: unknown,
    secret: unknown,
    assertIntent: () => void = () => undefined,
  ): Promise<Publication> {
    return this.exclusive(async () => {
      const credential = parseRecoveryCredential(secret);
      if (credential.purpose !== 'user-recovery') throw new Error('Choose your User recovery file');
      const saved = await verifyLocalRecoveryPackage(value, {
        userId: credential.identityId,
        userKeyFingerprint: credential.identityKeyId,
      });
      await validatePackageCredential(saved, credential);
      this.assertAccess();
      assertIntent();
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
          throw new Error('This Device is set up for a different User; use a fresh installation');
        session = null;
      }
      const existing = session
        ? await this.hierarchy.describeSetup(session.userId, session.deviceId)
        : null;
      let identity: KeyAccessIdentity;
      if (existing?.user === 'ready' && existing.identity) {
        await this.hierarchy.confirmUserRecovery(
          existing.identity.userId,
          existing.identity.registeredDeviceId,
          credential,
        );
        identity = existing.identity;
      } else {
        session = {
          formatVersion: 1,
          intent: 'recover-user',
          userId: credential.identityId,
          deviceId: freshId(),
          userKeyFingerprint: credential.identityKeyId,
        };
        await this.store.saveSession(session);
        identity = await this.hierarchy.recoverUserFromSource(
          credential,
          {
            loadUserRecoveryPackage: async userId =>
              userId === credential.identityId ? saved.userRecoveryPackage : null,
          },
          session.deviceId,
        );
      }
      assertIntent();
      const status = await this.hierarchy.describeSetup(
        identity.userId,
        identity.registeredDeviceId,
        saved.workplaceKeys.workplaceId,
      );
      // Capture this BEFORE installing external keys: a fresh package cannot authorize
      // claiming unrelated local books just because their Workplace ID collides.
      const preserveExistingBooks =
        status.workplace === 'ready' || status.workplace === 'recovery-required';
      if (status.workplace === 'missing' || status.workplace === 'recovery-required')
        await this.hierarchy.installWorkplaceKeys(identity, saved.workplaceKeys);
      else {
        const current = await this.hierarchy.exportWorkplaceKeys(
          identity,
          saved.workplaceKeys.workplaceId,
        );
        if (!current.recoveryConfirmed || current.keyId !== saved.workplaceKeys.keyId)
          throw new Error('Existing Workplace key differs');
      }
      const snapshot = await this.hierarchy.withWorkplaceKey(
        identity,
        saved.workplaceKeys.workplaceId,
        dek => decryptWorkplaceSnapshot(saved.snapshot, dek),
      );
      this.assertAccess();
      assertIntent();
      const reference = await this.store.writePackage(saved);
      await this.store.saveSession({ ...session!, package: { ...reference, confirmed: true } });
      this.assertAccess();
      assertIntent();
      return this.publish(snapshot, { preserveExistingBooks }); // Retain known local books; otherwise atomic original-ID publication.
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
