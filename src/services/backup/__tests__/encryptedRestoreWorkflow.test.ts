import { EncryptedRestoreWorkflow } from '../encryptedRestoreWorkflow';
import type { EncryptionSetupSession } from '../encryptionSetupStore';
import type { RestoreBackupResult } from '@/src/services/sync/restoreBackup';

jest.mock('@/src/services/sync/encryptedBackupActions', () => ({
  restoreEncryptedBackupZip: jest.fn(),
}));
jest.mock('../localKeyHierarchy', () => ({ localKeyHierarchy: {} }));
jest.mock('../cryptoProvider', () => ({ cryptoProvider: {} }));
jest.mock('../encryptionSetupStore', () => ({ encryptionSetupStore: {} }));
jest.mock('../pendingEncryptedRestoreDeviceId', () => ({
  loadPendingEncryptedRestoreDeviceId: jest.fn(),
  savePendingEncryptedRestoreDeviceId: jest.fn(),
  clearPendingEncryptedRestoreDeviceId: jest.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

const identity = { userId: 'user', registeredDeviceId: 'device', userKeyFingerprint: 'pin' };
const result: RestoreBackupResult = {
  status: 'completion-pending',
  identity,
  workplace: { id: 'workplace' } as RestoreBackupResult['workplace'],
  manifestHash: 'receipt',
  rowCount: 1,
  warnings: [],
};
const input = { archive: new Uint8Array([1]), credential: {} };

function harness() {
  let pending: string | null = null;
  let session: EncryptionSetupSession | null = null;
  const events: string[] = [];
  const dependencies = {
    pending: {
      load: jest.fn(async () => pending),
      save: jest.fn(async (id: string) => {
        pending = id;
        events.push('id');
      }),
      clear: jest.fn(async () => {
        events.push('clear');
        pending = null;
      }),
    },
    session: {
      loadSession: jest.fn(async () => session),
      saveSession: jest.fn(async (value: EncryptionSetupSession) => {
        events.push('session');
        session = value;
      }),
    },
    hierarchy: { describeSetup: jest.fn(async () => ({ user: 'ready' as const, identity })) },
    freshDeviceId: jest.fn(() => 'device'),
    restore: jest.fn(async () => {
      events.push('restore');
      return result;
    }),
  };
  return {
    dependencies,
    workflow: new EncryptedRestoreWorkflow(dependencies),
    events,
    pending: () => pending,
    session: () => session,
  };
}

describe('encrypted restore preparation and publication', () => {
  it('allocates once for concurrent consumers and reuses persisted IDs after remount', async () => {
    const h = harness();
    expect(
      await Promise.all([h.workflow.prepareRecoveryAttempt(), h.workflow.prepareRecoveryAttempt()]),
    ).toEqual(['device', 'device']);
    expect(await new EncryptedRestoreWorkflow(h.dependencies).prepareRecoveryAttempt()).toBe(
      'device',
    );
    expect(h.dependencies.freshDeviceId).toHaveBeenCalledTimes(1);
  });

  it.each(['load', 'save'] as const)(
    'rejects pending %s failure before recovery',
    async operation => {
      const h = harness();
      h.dependencies.pending[operation].mockRejectedValueOnce(new Error('storage unavailable'));
      await expect(h.workflow.restoreSelectedBackup(input)).rejects.toThrow('storage unavailable');
      expect(h.dependencies.restore).not.toHaveBeenCalled();
    },
  );

  it('uses supplied access without allocating a recovery identity', async () => {
    const h = harness();
    await h.workflow.restoreSelectedBackup({ archive: input.archive, existingIdentity: identity });
    expect(h.dependencies.restore).toHaveBeenCalledWith(
      input.archive,
      { mode: 'existing', identity },
      undefined,
    );
    expect(h.dependencies.pending.load).not.toHaveBeenCalled();
  });

  it('requires a credential before allocating recovery state', async () => {
    const h = harness();
    await expect(h.workflow.restoreSelectedBackup({ archive: input.archive })).rejects.toThrow(
      'Choose',
    );
    expect(h.dependencies.pending.save).not.toHaveBeenCalled();
  });

  it('retains the same recovery ID across a failed publication and retries', async () => {
    const h = harness();
    h.dependencies.restore.mockRejectedValueOnce(new Error('publication failed'));
    await expect(h.workflow.restoreSelectedBackup(input)).rejects.toThrow('publication failed');
    await new EncryptedRestoreWorkflow(h.dependencies).restoreSelectedBackup(input);
    expect(h.dependencies.restore).toHaveBeenLastCalledWith(
      input.archive,
      {
        mode: 'recovery',
        credential: input.credential,
        deviceId: 'device',
        draftId: 'device',
      },
      undefined,
    );
    expect(h.dependencies.freshDeviceId).toHaveBeenCalledTimes(1);
  });

  it('returns the published handoff without taking ownership of its completion checkpoints', async () => {
    const h = harness();
    expect(await h.workflow.restoreSelectedBackup(input)).toBe(result);
    expect(h.events).toEqual(['id', 'restore']);
    expect(h.dependencies.session.saveSession).not.toHaveBeenCalled();
    expect(h.dependencies.pending.clear).not.toHaveBeenCalled();
  });

  it('re-verifies a saved identity before a later restore', async () => {
    const h = harness();
    await h.dependencies.session.saveSession({
      formatVersion: 1,
      intent: 'recover-user',
      userId: 'user',
      deviceId: 'device',
      userKeyFingerprint: 'pin',
    });
    await h.workflow.restoreSelectedBackup({ archive: input.archive });
    expect(h.dependencies.restore).toHaveBeenCalledWith(
      input.archive,
      { mode: 'existing', identity },
      undefined,
    );
    h.dependencies.hierarchy.describeSetup.mockResolvedValueOnce({
      user: 'ready',
      identity: { ...identity, userKeyFingerprint: 'other' },
    });
    await expect(
      h.workflow.restoreSelectedBackup({ archive: input.archive }),
    ).rejects.toMatchObject({ code: 'FFB_KEY_IDENTITY_MISMATCH' });
  });

  it('does not delegate cancelled queued work', async () => {
    const h = harness();
    const controller = new AbortController();
    controller.abort();
    await expect(h.workflow.prepareRecoveryAttempt(controller.signal)).rejects.toMatchObject({
      code: 'FFB_KEY_CANCELLED',
    });
    const gate = deferred<RestoreBackupResult>();
    h.dependencies.restore.mockReturnValueOnce(gate.promise);
    const first = h.workflow.restoreSelectedBackup(input);
    const queued = h.workflow.restoreSelectedBackup({ ...input, signal: controller.signal });
    const rejected = expect(queued).rejects.toMatchObject({ code: 'FFB_KEY_CANCELLED' });
    gate.resolve(result);
    await first;
    await rejected;
    expect(h.dependencies.restore).toHaveBeenCalledTimes(1);
  });
});
