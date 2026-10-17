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
  identity,
  workplace: { id: 'workplace' } as RestoreBackupResult['workplace'],
  manifestHash: 'receipt',
  rowCount: 1,
  warnings: ['Post-restore running-balance rebuild failed'],
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

describe('durable encrypted restore workflow', () => {
  it('allocates once for concurrent consumers and reuses persisted IDs in a new instance', async () => {
    const h = harness();
    expect(
      await Promise.all([h.workflow.prepareRecoveryAttempt(), h.workflow.prepareRecoveryAttempt()]),
    ).toEqual(['device', 'device']);
    const remounted = new EncryptedRestoreWorkflow(h.dependencies);
    expect(await remounted.prepareRecoveryAttempt()).toBe('device');
    expect(h.dependencies.freshDeviceId).toHaveBeenCalledTimes(1);
  });

  it.each(['load', 'save'] as const)(
    'propagates pending %s failure before recovery',
    async operation => {
      const h = harness();
      h.dependencies.pending[operation].mockRejectedValueOnce(new Error('storage unavailable'));
      await expect(h.workflow.restoreSelectedBackup(input)).rejects.toThrow('storage unavailable');
      expect(h.dependencies.restore).not.toHaveBeenCalled();
      if (operation === 'load') expect(h.dependencies.freshDeviceId).not.toHaveBeenCalled();
    },
  );

  it('uses supplied verified access without a credential or pending ID allocation', async () => {
    const h = harness();
    await h.workflow.restoreSelectedBackup({ archive: input.archive, existingIdentity: identity });
    expect(h.dependencies.restore).toHaveBeenCalledWith(input.archive, {
      mode: 'existing',
      identity,
    });
    expect(h.dependencies.freshDeviceId).not.toHaveBeenCalled();
    expect(h.dependencies.pending.load).not.toHaveBeenCalled();
  });

  it('requires a credential before allocating recovery state', async () => {
    const h = harness();
    await expect(h.workflow.restoreSelectedBackup({ archive: input.archive })).rejects.toThrow(
      'Choose',
    );
    expect(h.dependencies.pending.save).not.toHaveBeenCalled();
    expect(h.dependencies.restore).not.toHaveBeenCalled();
  });

  it('retains the pending attempt on restore failure and retries with the same ID', async () => {
    const h = harness();
    h.dependencies.restore.mockRejectedValueOnce(new Error('publication failed'));
    await expect(h.workflow.restoreSelectedBackup(input)).rejects.toThrow('publication failed');
    expect(h.pending()).toBe('device');
    expect(h.dependencies.session.saveSession).not.toHaveBeenCalled();
    expect(h.dependencies.pending.clear).not.toHaveBeenCalled();
    await h.workflow.restoreSelectedBackup(input);
    expect(h.dependencies.restore).toHaveBeenNthCalledWith(2, input.archive, {
      mode: 'recovery',
      credential: input.credential,
      deviceId: 'device',
    });
    expect(h.dependencies.freshDeviceId).toHaveBeenCalledTimes(1);
  });

  it('saves the exact session before clearing the checkpoint and preserves warnings', async () => {
    const h = harness();
    expect(await h.workflow.restoreSelectedBackup(input)).toBe(result);
    expect(h.events).toEqual(['id', 'restore', 'session', 'clear']);
    expect(h.session()).toEqual({
      formatVersion: 1,
      intent: 'recover-user',
      userId: 'user',
      deviceId: 'device',
      userKeyFingerprint: 'pin',
      enrolledWorkplaces: ['workplace'],
    });
    expect(h.pending()).toBeNull();
  });

  it('retains the Device ID after a session failure and allows retry after remount', async () => {
    const h = harness();
    h.dependencies.session.saveSession.mockRejectedValueOnce(new Error('session failed'));
    await expect(h.workflow.restoreSelectedBackup(input)).rejects.toThrow('session failed');
    expect(h.pending()).toBe('device');
    expect(h.dependencies.pending.clear).not.toHaveBeenCalled();
    const remounted = new EncryptedRestoreWorkflow(h.dependencies);
    expect(await remounted.restoreSelectedBackup(input)).toBe(result);
    expect(h.dependencies.restore).toHaveBeenNthCalledWith(2, input.archive, {
      mode: 'recovery',
      credential: input.credential,
      deviceId: 'device',
    });
    expect(h.dependencies.freshDeviceId).toHaveBeenCalledTimes(1);
  });

  it('re-verifies the saved Device after checkpoint removal fails', async () => {
    const h = harness();
    h.dependencies.pending.clear.mockRejectedValueOnce(new Error('clear failed'));
    await expect(h.workflow.restoreSelectedBackup(input)).rejects.toThrow('clear failed');
    expect(h.pending()).toBe('device');
    const remounted = new EncryptedRestoreWorkflow(h.dependencies);
    await remounted.restoreSelectedBackup({ archive: input.archive });
    expect(h.dependencies.hierarchy.describeSetup).toHaveBeenCalledWith('user', 'device');
    expect(h.dependencies.restore).toHaveBeenNthCalledWith(2, input.archive, {
      mode: 'existing',
      identity,
    });
    expect(h.pending()).toBeNull();
    expect(h.dependencies.freshDeviceId).toHaveBeenCalledTimes(1);
  });

  it('rechecks saved identity for a queued restore after the first clears the checkpoint', async () => {
    const h = harness();
    const gate = deferred<RestoreBackupResult>();
    h.dependencies.restore.mockReturnValueOnce(gate.promise);
    const first = h.workflow.restoreSelectedBackup(input);
    const second = h.workflow.restoreSelectedBackup(input);
    gate.resolve(result);
    await Promise.all([first, second]);
    expect(h.dependencies.restore).toHaveBeenNthCalledWith(2, input.archive, {
      mode: 'existing',
      identity,
    });
    expect(h.dependencies.freshDeviceId).toHaveBeenCalledTimes(1);
  });

  it('rejects a saved identity whose fingerprint differs from its verified keys', async () => {
    const h = harness();
    await h.workflow.restoreSelectedBackup(input);
    h.dependencies.hierarchy.describeSetup.mockResolvedValueOnce({
      user: 'ready',
      identity: { ...identity, userKeyFingerprint: 'other' },
    });
    await expect(h.workflow.restoreSelectedBackup(input)).rejects.toMatchObject({
      code: 'FFB_KEY_IDENTITY_MISMATCH',
    });
    expect(h.dependencies.restore).toHaveBeenCalledTimes(1);
  });

  it('does not allocate for cancelled preparation or delegate a cancelled queued restore', async () => {
    const h = harness();
    const controller = new AbortController();
    controller.abort();
    await expect(h.workflow.prepareRecoveryAttempt(controller.signal)).rejects.toMatchObject({
      code: 'FFB_KEY_CANCELLED',
    });
    expect(h.dependencies.freshDeviceId).not.toHaveBeenCalled();
    const gate = deferred<RestoreBackupResult>();
    h.dependencies.restore.mockReturnValueOnce(gate.promise);
    const first = h.workflow.restoreSelectedBackup(input);
    const queued = h.workflow.restoreSelectedBackup({ ...input, signal: controller.signal });
    const rejection = expect(queued).rejects.toMatchObject({ code: 'FFB_KEY_CANCELLED' });
    gate.resolve(result);
    await first;
    await rejection;
    expect(h.dependencies.restore).toHaveBeenCalledTimes(1);
  });

  it('checks cancellation again after asynchronous ID persistence', async () => {
    const h = harness();
    const controller = new AbortController();
    h.dependencies.pending.save.mockImplementationOnce(async () => {
      controller.abort();
    });
    await expect(
      h.workflow.restoreSelectedBackup({ ...input, signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'FFB_KEY_CANCELLED' });
    expect(h.dependencies.restore).not.toHaveBeenCalled();
  });

  it('finalizes successful restoration even if its caller cancels during delegation', async () => {
    const h = harness();
    const controller = new AbortController();
    h.dependencies.restore.mockImplementationOnce(async () => {
      controller.abort();
      return result;
    });
    expect(await h.workflow.restoreSelectedBackup({ ...input, signal: controller.signal })).toBe(
      result,
    );
    expect(h.session()).not.toBeNull();
    expect(h.pending()).toBeNull();
  });
});
