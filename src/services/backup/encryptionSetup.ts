import { SerialQueue } from '@/src/utils/serialQueue';
import { type KeyHierarchy, localKeyHierarchy } from './localKeyHierarchy';
import { type KeyAccessIdentity, type EncryptionSetupStatus } from './keyHierarchyRecords';
import {
  encryptionSetupStore,
  type EncryptionSetupStore,
  type EncryptionSetupSession,
} from './encryptionSetupStore';
import { parseRecoveryCredential, type RecoveryCredential } from './keyEnvelopes';
import { cryptoProvider } from './cryptoProvider';
import { keyHex } from './keyEncoding';
import { KeyOperationError } from '@/src/utils/keyOperationError';
import { assertKeyAccessAllowed } from './keyAccessPolicy';

function freshId(): string {
  const bytes = cryptoProvider.randomBytes(16);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = keyHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export interface SetupViewState {
  session: EncryptionSetupSession | null;
  keys: EncryptionSetupStatus | null;
}
/** Human workflow over the existing hierarchy. Durable checkpoints contain no recovery secret. */
export class EncryptionSetup {
  private readonly queue = new SerialQueue();
  constructor(
    private readonly hierarchy: KeyHierarchy,
    private readonly store: EncryptionSetupStore,
    private readonly assertAccess: () => void,
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
      return { session, keys };
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
      await this.hierarchy.confirmWorkplaceRecovery(
        identity,
        workplaceId,
        parseRecoveryCredential(value),
      );
      this.assertAccess();
      // Explicit verification supersedes this Workplace's failed recovery.
      const bindings = session.verifiedWorkplaces ?? [];
      const existing = bindings.find(binding => binding.workplaceId === workplaceId);
      if (existing && existing.keyId !== keys.keyId)
        throw new KeyOperationError('FFB_KEY_IDENTITY_MISMATCH', 'Existing Workplace key differs');
      await this.store.saveSession({
        ...session,
        enrolledWorkplaces: [...new Set([...(session.enrolledWorkplaces ?? []), workplaceId])],
        verifiedWorkplaces: existing ? bindings : [...bindings, { workplaceId, keyId: keys.keyId }],
      });
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
}

export const encryptionSetup = new EncryptionSetup(
  localKeyHierarchy,
  encryptionSetupStore,
  assertKeyAccessAllowed,
);
