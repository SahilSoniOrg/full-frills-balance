import { asWorkplaceId } from '@/src/types/ids';
import { resetDatabase } from '@/src/testing/resetDatabase';
import {
  ManualOnlineBackupCoordinator,
  type ManualBackupStateStore,
  type PendingManualBackup,
  type TrustedBackupIdentity,
  type WorkplaceBackupConsent,
} from '../manualOnlineBackup';
import { snapshotFingerprint } from '../encryptedSnapshot';
import { restoreWorkplaceSnapshot } from '@/src/services/import/restoreWorkplaceSnapshot';
import { enableTestCrypto, seedSnapshotWorkplace } from './snapshotTestHelpers';
import { enrolledKeyHierarchy } from './keyHierarchyTestHelpers';

jest.mock('react-native-quick-crypto', () => ({
  __esModule: true,
  default: {
    ...jest.requireActual('node:crypto'),
    Buffer: jest.requireActual('node:buffer').Buffer,
  },
}));
jest.mock('@/src/services/import/restoreWorkplaceSnapshot', () => ({
  restoreWorkplaceSnapshot: jest.fn(async snapshot => ({
    workplaceId: snapshot.workplace.id,
    bookPreferences: snapshot.bookPreferences,
  })),
}));
const WORKPLACE = asWorkplaceId('snapshot-workplace');

async function setup() {
  const { snapshot } = await seedSnapshotWorkplace();
  const keyContext = await enrolledKeyHierarchy();
  let identity: TrustedBackupIdentity = {
    ...keyContext.identity,
    accessToken: 'session',
    userKeyAnchorVerified: true,
    deviceRegistrationVerified: true,
    signRequest: jest.fn(async () => 'signature'),
  };
  const consents = new Map<string, WorkplaceBackupConsent>(),
    pending = new Map<string, PendingManualBackup>();
  const scope = (user: string, workplace: string) => JSON.stringify([user, workplace]);
  const state: ManualBackupStateStore = {
    loadConsent: jest.fn(async (user, workplace) => consents.get(scope(user, workplace)) ?? null),
    saveConsent: jest.fn(async consent => {
      if (
        consents.get(scope(consent.userId, consent.workplaceId))?.revokedAt !== undefined &&
        consent.revokedAt === undefined
      )
        throw new Error('Revoked consent cannot be overwritten');
      consents.set(scope(consent.userId, consent.workplaceId), consent);
    }),
    loadPending: jest.fn(async (user, workplace) => pending.get(scope(user, workplace)) ?? null),
    savePending: jest.fn(async item => {
      pending.set(scope(item.userId, item.workplaceId), item);
    }),
    clearPending: jest.fn(async (user, workplace, snapshotId) => {
      if (pending.get(scope(user, workplace))?.envelope.snapshotId !== snapshotId)
        throw new Error('Pending snapshot changed');
      pending.delete(scope(user, workplace));
    }),
  };
  const dependencies: ConstructorParameters<typeof ManualOnlineBackupCoordinator>[0] = {
    identity: jest.fn(async () => identity),
    state,
    keys: keyContext.hierarchy,
    capture: jest.fn(async () => snapshot),
    now: () => 123456,
    transport: {
      configured: true,
      upload: jest.fn(async input => ({
        snapshotId: input.envelope.snapshotId,
        contentHash: input.contentHash,
      })),
      downloadLatest: jest.fn(),
    },
  };
  return {
    dependencies,
    keyContext,
    snapshot,
    state,
    consents,
    pending,
    scope,
    coordinator: new ManualOnlineBackupCoordinator(dependencies),
    identity: () => identity,
    changeIdentity: (next: TrustedBackupIdentity) => {
      identity = next;
    },
  };
}
beforeEach(async () => {
  jest.clearAllMocks();
  enableTestCrypto();
  await resetDatabase();
});

it('requires explicit consent, a trusted session and configured service before capture', async () => {
  const context = await setup();
  await expect(context.coordinator.prepare(WORKPLACE, { consentAccepted: false })).rejects.toThrow(
    'Explicit consent',
  );
  expect(context.dependencies.capture).not.toHaveBeenCalled();
  context.changeIdentity({
    ...context.identity(),
    userKeyAnchorVerified: false,
  } as unknown as TrustedBackupIdentity);
  await expect(context.coordinator.prepare(WORKPLACE, { consentAccepted: true })).rejects.toThrow(
    'trusted User key',
  );
  const disabled = new ManualOnlineBackupCoordinator({
    ...context.dependencies,
    transport: { ...context.dependencies.transport, configured: false },
  });
  await expect(disabled.prepare(WORKPLACE, { consentAccepted: true })).rejects.toThrow(
    'not configured',
  );
});
it('uses the enrolled chain without any recovery secret and retries identical ciphertext without spending more budget', async () => {
  const context = await setup();
  const prepared = await context.coordinator.prepare(WORKPLACE, { consentAccepted: true });
  expect(prepared).not.toHaveProperty('recoveryCode');
  const original = [...context.pending.values()][0];
  jest
    .mocked(context.dependencies.transport.upload)
    .mockRejectedValueOnce(new Error('response lost'));
  await expect(context.coordinator.uploadPending(WORKPLACE)).rejects.toThrow('response lost');
  const restarted = new ManualOnlineBackupCoordinator(context.dependencies);
  const result = await restarted.retryPendingUpload(WORKPLACE);
  expect(result.snapshotId).toBe(prepared.snapshotId);
  const calls = jest.mocked(context.dependencies.transport.upload).mock.calls;
  expect(calls[0][0].envelope).toBe(original.envelope);
  expect(calls[1][0].envelope).toBe(original.envelope);
  expect(context.pending.size).toBe(0);
  expect(
    (
      await context.keyContext.hierarchy.exportWorkplaceKeys(
        context.keyContext.identity,
        String(WORKPLACE),
      )
    ).encryptionInvocations,
  ).toBe(1);
});
it('does not generate a missing Workplace DEK or enroll keys as a side effect of backup', async () => {
  const context = await setup();
  context.keyContext.ciphertext.delete(JSON.stringify(['workplace', 'alice', String(WORKPLACE)]));
  const before = context.keyContext.deviceSecrets.size;
  await expect(context.coordinator.prepare(WORKPLACE, { consentAccepted: true })).rejects.toThrow(
    'Enroll',
  );
  expect(context.pending.size).toBe(0);
  expect(context.keyContext.deviceSecrets.size).toBe(before);
});
it('retains pending ciphertext after consent storage fails and prevents replacement after response loss', async () => {
  const context = await setup();
  await context.coordinator.prepare(WORKPLACE, { consentAccepted: true });
  jest.mocked(context.state.saveConsent).mockRejectedValueOnce(new Error('storage interrupted'));
  await expect(context.coordinator.uploadPending(WORKPLACE)).rejects.toThrow('storage interrupted');
  expect(context.dependencies.transport.upload).not.toHaveBeenCalled();
  expect(context.pending.size).toBe(1);
  jest
    .mocked(context.dependencies.transport.upload)
    .mockRejectedValueOnce(new Error('response lost'));
  await expect(context.coordinator.uploadPending(WORKPLACE)).rejects.toThrow('response lost');
  await expect(context.coordinator.prepare(WORKPLACE, { consentAccepted: true })).rejects.toThrow(
    'existing pending',
  );
  await expect(context.coordinator.cancelPending(WORKPLACE)).rejects.toThrow('retained');
  await context.coordinator.retryPendingUpload(WORKPLACE);
});
it.each(['account', 'session', 'anchor', 'device', 'revoke'] as const)(
  'blocks %s changes during awaited capture before staging',
  async change => {
    const context = await setup();
    jest.mocked(context.dependencies.capture).mockImplementationOnce(async () => {
      if (change === 'account') context.changeIdentity({ ...context.identity(), userId: 'bob' });
      if (change === 'session')
        context.changeIdentity({ ...context.identity(), accessToken: 'new' });
      if (change === 'anchor')
        context.changeIdentity({ ...context.identity(), userKeyFingerprint: 'new' });
      if (change === 'device')
        context.changeIdentity({ ...context.identity(), registeredDeviceId: 'new' });
      if (change === 'revoke') await context.coordinator.revokeConsent(WORKPLACE);
      return context.snapshot;
    });
    await expect(
      context.coordinator.prepare(WORKPLACE, { consentAccepted: true }),
    ).rejects.toThrow();
    expect(context.pending.size).toBe(0);
    expect(context.dependencies.transport.upload).not.toHaveBeenCalled();
  },
);
it('preserves durable revocation when publication is paused in consent persistence', async () => {
  const context = await setup();
  await context.coordinator.prepare(WORKPLACE, { consentAccepted: true });
  const save = context.state.saveConsent;
  let release!: () => void;
  let reached!: () => void;
  const paused = new Promise<void>(resolve => {
    reached = resolve;
  });
  jest.mocked(context.state.saveConsent).mockImplementationOnce(async consent => {
    reached();
    await new Promise<void>(resolve => {
      release = resolve;
    });
    await save(consent);
  });
  const publishing = context.coordinator.uploadPending(WORKPLACE);
  await paused;
  await context.coordinator.revokeConsent(WORKPLACE);
  release();
  await expect(publishing).rejects.toThrow('Revoked');
  expect(context.dependencies.transport.upload).not.toHaveBeenCalled();
});
it('rejects stale acknowledgements without clearing a different pending snapshot', async () => {
  const context = await setup();
  await context.coordinator.prepare(WORKPLACE, { consentAccepted: true });
  jest.mocked(context.dependencies.transport.upload).mockImplementationOnce(async input => {
    const item = [...context.pending.values()][0];
    context.pending.set(context.scope(item.userId, item.workplaceId), {
      ...item,
      envelope: { ...item.envelope, snapshotId: 'ab'.repeat(16) },
    });
    return { snapshotId: input.envelope.snapshotId, contentHash: input.contentHash };
  });
  await expect(context.coordinator.uploadPending(WORKPLACE)).rejects.toThrow(
    'Pending snapshot changed',
  );
  expect([...context.pending.values()][0].envelope.snapshotId).toBe('ab'.repeat(16));
});
it('restores through the User chain, leaves activation to the finisher, and grants no upload consent', async () => {
  const context = await setup();
  await context.coordinator.prepare(WORKPLACE, { consentAccepted: true });
  const item = [...context.pending.values()][0];
  context.pending.clear();
  jest.mocked(context.dependencies.transport.downloadLatest).mockResolvedValue({
    ownerUserId: 'alice',
    workplaceId: String(WORKPLACE),
    userKeyFingerprint: context.identity().userKeyFingerprint,
    envelope: item.envelope,
    contentHash: await snapshotFingerprint(JSON.stringify(item.envelope)),
  });
  await expect(context.coordinator.restoreLatest(WORKPLACE, false)).rejects.toThrow('Confirm');
  expect(context.dependencies.transport.downloadLatest).not.toHaveBeenCalled();
  await context.coordinator.restoreLatest(WORKPLACE, true);
  expect(restoreWorkplaceSnapshot).toHaveBeenCalledWith(context.snapshot);
  expect(context.consents.size).toBe(0);
  expect(context.dependencies.transport.upload).not.toHaveBeenCalled();
  await expect(context.coordinator.prepare(WORKPLACE, { consentAccepted: false })).rejects.toThrow(
    'Explicit consent',
  );
});
