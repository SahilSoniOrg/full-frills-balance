import { schema } from '@/src/data/database/schema';
import type { WorkplaceId } from '@/src/types/ids';
import {
  decryptWorkplaceSnapshot,
  encryptWorkplaceSnapshot,
  snapshotFingerprint,
} from './encryptedSnapshot';
import { captureWorkplaceSnapshot, type WorkplaceSnapshot } from './workplaceSnapshot';
import { localKeyHierarchy, type WorkplaceKeyAccess } from './localKeyHierarchy';
import { restoreWorkplaceSnapshot } from '@/src/services/import/restoreWorkplaceSnapshot';
import { AppConfig } from '@/src/constants/app-config';
import { manualBackupStateStore } from './manualOnlineBackupStateStore';
import { FetchManualBackupTransport } from './manualOnlineBackupTransport';
import type {
  ManualBackupStateStore,
  ManualBackupTransport,
  PendingManualBackup,
  TrustedBackupIdentity,
  WorkplaceBackupConsent,
} from './manualOnlineBackupContracts';
export type {
  ManualBackupStateStore,
  ManualBackupTransport,
  PendingManualBackup,
  TrustedBackupIdentity,
  WorkplaceBackupConsent,
} from './manualOnlineBackupContracts';

export interface ManualOnlineBackupDependencies {
  readonly identity: () => Promise<TrustedBackupIdentity | null>;
  readonly state: ManualBackupStateStore;
  readonly transport: ManualBackupTransport;
  readonly capture: (workplaceId: WorkplaceId) => Promise<WorkplaceSnapshot>;
  readonly keys: WorkplaceKeyAccess;
  readonly now?: () => number;
}
export class ManualOnlineBackupUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManualOnlineBackupUnavailableError';
  }
}
function assertIdentity(
  identity: TrustedBackupIdentity | null,
): asserts identity is TrustedBackupIdentity {
  if (
    !identity ||
    !identity.userId?.trim() ||
    !identity.accessToken?.trim() ||
    !identity.userKeyFingerprint?.trim() ||
    !identity.registeredDeviceId?.trim() ||
    identity.userKeyAnchorVerified !== true ||
    identity.deviceRegistrationVerified !== true ||
    typeof identity.signRequest !== 'function'
  )
    throw new ManualOnlineBackupUnavailableError(
      'Sign in and register this Device with the trusted User key before using online backup.',
    );
}
function assertCurrentSnapshot(snapshot: WorkplaceSnapshot, workplaceId: string): void {
  if (snapshot.schemaVersion !== 35 || schema.version !== 35)
    throw new ManualOnlineBackupUnavailableError(
      'This backup schema is not in the supported online snapshot allowlist.',
    );
  if (snapshot.workplace.id !== workplaceId)
    throw new Error('Captured snapshot belongs to a different Workplace');
}
function assertBound(
  record: Pick<
    WorkplaceBackupConsent,
    'userId' | 'workplaceId' | 'userKeyFingerprint' | 'registeredDeviceId'
  >,
  identity: TrustedBackupIdentity,
  workplaceId: string,
): void {
  if (
    record.userId !== identity.userId ||
    record.workplaceId !== workplaceId ||
    record.userKeyFingerprint !== identity.userKeyFingerprint ||
    record.registeredDeviceId !== identity.registeredDeviceId
  )
    throw new ManualOnlineBackupUnavailableError(
      'Account, User key, Device, and Workplace must match this backup.',
    );
}
const revokedScopes = new WeakMap<ManualBackupStateStore, Set<string>>();
const revokingWorkplaces = new WeakMap<ManualBackupStateStore, Map<string, number>>();
const operations = new WeakMap<ManualBackupStateStore, Promise<unknown>>();
const scopeId = (userId: string, workplaceId: string) => JSON.stringify([userId, workplaceId]);

/** Manual publication consumes already enrolled keys. It never creates keys or uses recovery secrets. */
export class ManualOnlineBackupCoordinator {
  private readonly now: () => number;
  constructor(private readonly dependencies: ManualOnlineBackupDependencies) {
    this.now = dependencies.now ?? Date.now;
  }
  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = operations.get(this.dependencies.state) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    operations.set(
      this.dependencies.state,
      next.catch(() => undefined),
    );
    return next;
  }
  prepare(
    workplaceId: WorkplaceId,
    options: { consentAccepted: boolean },
  ): Promise<{ snapshotId: string }> {
    return this.exclusive(async () => {
      const identity = await this.requireReadyIdentity();
      const scope = String(workplaceId);
      if (await this.dependencies.state.loadPending(identity.userId, scope))
        throw new ManualOnlineBackupUnavailableError(
          'Resume or safely cancel the existing pending snapshot first.',
        );
      const consent = await this.dependencies.state.loadConsent(identity.userId, scope);
      if (consent) assertBound(consent, identity, scope);
      if (consent?.revokedAt !== undefined)
        throw new ManualOnlineBackupUnavailableError('Online backup consent has been revoked.');
      if (!consent && options.consentAccepted !== true)
        throw new ManualOnlineBackupUnavailableError(
          'Explicit consent for this Workplace is required before preparing an online backup.',
        );
      const snapshot = await this.dependencies.capture(workplaceId);
      assertCurrentSnapshot(snapshot, scope);
      const envelope = await this.dependencies.keys.withWorkplaceKey(
        identity,
        scope,
        dek => encryptWorkplaceSnapshot(snapshot, dek),
        true,
      );
      await this.assertStillAuthorized(identity, scope);
      await this.dependencies.state.savePending({
        userId: identity.userId,
        workplaceId: scope,
        userKeyFingerprint: identity.userKeyFingerprint,
        registeredDeviceId: identity.registeredDeviceId,
        consentAcceptedAt: consent?.consentedAt ?? this.now(),
        envelope,
      });
      return { snapshotId: envelope.snapshotId };
    });
  }
  /** Initial publication and retries use the exact immutable ciphertext staged by explicit preparation. */
  uploadPending(workplaceId: WorkplaceId): Promise<{ snapshotId: string; contentHash: string }> {
    return this.exclusive(async () => {
      const identity = await this.requireReadyIdentity();
      const scope = String(workplaceId);
      const pending = await this.requirePending(identity, scope);
      await this.assertStillAuthorized(identity, scope);
      const consent = await this.dependencies.state.loadConsent(identity.userId, scope);
      if (!consent)
        await this.dependencies.state.saveConsent({
          userId: identity.userId,
          workplaceId: scope,
          userKeyFingerprint: identity.userKeyFingerprint,
          registeredDeviceId: identity.registeredDeviceId,
          consentedAt: pending.consentAcceptedAt,
        });
      return this.publish(pending, identity);
    });
  }
  retryPendingUpload(workplaceId: WorkplaceId) {
    return this.uploadPending(workplaceId);
  }

  /** Local opt-out is immediate and account-scoped; remote revocation needs a future API. */
  async revokeConsent(workplaceId: WorkplaceId): Promise<void> {
    const scope = String(workplaceId);
    // Pause dispatch synchronously while the async identity provider determines the account scope.
    const revoking = revokingWorkplaces.get(this.dependencies.state) ?? new Map<string, number>();
    revoking.set(scope, (revoking.get(scope) ?? 0) + 1);
    revokingWorkplaces.set(this.dependencies.state, revoking);
    try {
      const identity = await this.dependencies.identity();
      assertIdentity(identity);
      const revoked = revokedScopes.get(this.dependencies.state) ?? new Set<string>();
      revoked.add(scopeId(identity.userId, scope));
      revokedScopes.set(this.dependencies.state, revoked);
      const consent = await this.dependencies.state.loadConsent(identity.userId, scope);
      if (consent) assertBound(consent, identity, scope);
      await this.dependencies.state.saveConsent({
        ...(consent ?? {
          userId: identity.userId,
          workplaceId: scope,
          userKeyFingerprint: identity.userKeyFingerprint,
          registeredDeviceId: identity.registeredDeviceId,
          consentedAt: this.now(),
        }),
        revokedAt: this.now(),
      });
    } finally {
      const remaining = (revoking.get(scope) ?? 1) - 1;
      if (remaining === 0) revoking.delete(scope);
      else revoking.set(scope, remaining);
    }
  }
  cancelPending(workplaceId: WorkplaceId): Promise<void> {
    return this.exclusive(async () => {
      const identity = await this.requireReadyIdentity();
      const scope = String(workplaceId);
      const pending = await this.requirePending(identity, scope);
      // Conservatively retain anything whose consent was committed before a possible dispatch.
      if (await this.dependencies.state.loadConsent(identity.userId, scope))
        throw new ManualOnlineBackupUnavailableError(
          'A possibly published snapshot must be retained for retry.',
        );
      await this.dependencies.state.clearPending(
        identity.userId,
        scope,
        pending.envelope.snapshotId,
      );
    });
  }
  /** Ordinary restore follows User recovery/enrollment and the User-addressed DEK envelope. */
  restoreLatest(
    workplaceId: WorkplaceId,
    restoreConsentAccepted: boolean,
  ): Promise<{
    workplaceId: WorkplaceId;
    bookPreferences: WorkplaceSnapshot['bookPreferences'];
  }> {
    return this.exclusive(async () => {
      if (restoreConsentAccepted !== true)
        throw new ManualOnlineBackupUnavailableError(
          'Confirm that you want to download and restore this Workplace before continuing.',
        );
      const identity = await this.requireReadyIdentity();
      const scope = String(workplaceId);
      const remote = await this.dependencies.transport.downloadLatest({
        identity,
        workplaceId: scope,
        assertAuthorized: () => this.assertSessionCurrent(identity),
        assertDispatchAllowed: () => undefined,
      });
      if (
        remote.ownerUserId !== identity.userId ||
        remote.workplaceId !== scope ||
        remote.userKeyFingerprint !== identity.userKeyFingerprint
      )
        throw new ManualOnlineBackupUnavailableError(
          'The backup owner, trusted key, or Workplace does not match.',
        );
      if ((await snapshotFingerprint(JSON.stringify(remote.envelope))) !== remote.contentHash)
        throw new Error('Downloaded snapshot integrity check failed');
      if (remote.envelope.workplaceId !== scope)
        throw new Error('Downloaded snapshot belongs to another Workplace');
      const snapshot = await this.dependencies.keys.withWorkplaceKey(identity, scope, dek =>
        decryptWorkplaceSnapshot(remote.envelope, dek),
      );
      assertCurrentSnapshot(snapshot, scope);
      await this.assertSessionCurrent(identity);
      // Download consent never grants upload permission. Emergency dump decryption has its own pure API.
      return restoreWorkplaceSnapshot(snapshot);
    });
  }
  private async requireReadyIdentity(): Promise<TrustedBackupIdentity> {
    if (!this.dependencies.transport.configured)
      throw new ManualOnlineBackupUnavailableError(
        'The online backup service is not configured. No network request was made.',
      );
    const identity = await this.dependencies.identity();
    assertIdentity(identity);
    return identity;
  }
  private async assertSessionCurrent(expected: TrustedBackupIdentity): Promise<void> {
    const current = await this.requireReadyIdentity();
    if (
      current.userId !== expected.userId ||
      current.accessToken !== expected.accessToken ||
      current.userKeyFingerprint !== expected.userKeyFingerprint ||
      current.registeredDeviceId !== expected.registeredDeviceId
    )
      throw new ManualOnlineBackupUnavailableError(
        'Account or Device session changed; retry explicitly.',
      );
  }
  private assertNotRevoked(identity: TrustedBackupIdentity, scope: string): void {
    if (
      revokingWorkplaces.get(this.dependencies.state)?.has(scope) ||
      revokedScopes.get(this.dependencies.state)?.has(scopeId(identity.userId, scope))
    )
      throw new ManualOnlineBackupUnavailableError(
        'Online backup consent was revoked; no upload is allowed.',
      );
  }
  private async assertStillAuthorized(
    identity: TrustedBackupIdentity,
    scope: string,
    requireConsent = false,
  ): Promise<void> {
    const consent = await this.dependencies.state.loadConsent(identity.userId, scope);
    if (consent) assertBound(consent, identity, scope);
    if (consent?.revokedAt !== undefined || (requireConsent && !consent))
      throw new ManualOnlineBackupUnavailableError(
        'Active consent for this Workplace is required before upload.',
      );
    await this.assertSessionCurrent(identity);
    this.assertNotRevoked(identity, scope);
  }
  private async requirePending(
    identity: TrustedBackupIdentity,
    scope: string,
  ): Promise<PendingManualBackup> {
    const pending = await this.dependencies.state.loadPending(identity.userId, scope);
    if (!pending)
      throw new ManualOnlineBackupUnavailableError(
        'There is no resumable snapshot for this Workplace.',
      );
    assertBound(pending, identity, scope);
    if (pending.envelope.workplaceId !== scope) throw new Error('Pending envelope scope mismatch');
    return pending;
  }
  private async publish(pending: PendingManualBackup, identity: TrustedBackupIdentity) {
    await this.dependencies.keys.withWorkplaceKey(identity, pending.workplaceId, async dek => {
      assertCurrentSnapshot(
        await decryptWorkplaceSnapshot(pending.envelope, dek),
        pending.workplaceId,
      );
    });
    const contentHash = await snapshotFingerprint(JSON.stringify(pending.envelope));
    await this.assertStillAuthorized(identity, pending.workplaceId, true);
    const result = await this.dependencies.transport.upload({
      identity,
      workplaceId: pending.workplaceId,
      envelope: pending.envelope,
      contentHash,
      idempotencyKey: pending.envelope.snapshotId,
      assertAuthorized: () => this.assertStillAuthorized(identity, pending.workplaceId, true),
      assertDispatchAllowed: () => this.assertNotRevoked(identity, pending.workplaceId),
    });
    if (result.snapshotId !== pending.envelope.snapshotId || result.contentHash !== contentHash)
      throw new Error('Backup server acknowledged different snapshot content');
    await this.dependencies.state.clearPending(
      identity.userId,
      pending.workplaceId,
      pending.envelope.snapshotId,
    );
    return result;
  }
}

/** No hosted identity/challenge provider exists. The encrypted local lifecycle is independent. */
export const manualOnlineBackupCoordinator = new ManualOnlineBackupCoordinator({
  identity: async () => null,
  state: manualBackupStateStore,
  transport: new FetchManualBackupTransport(AppConfig.api.onlineBackupBaseUrl),
  capture: captureWorkplaceSnapshot,
  keys: localKeyHierarchy,
});
