import { of } from 'rxjs';
import { EncryptedRestoreCompletion } from '../encryptedRestoreCompletion';
import type { RestoreCompletionState } from '../restoreCompletionState';
import type { EncryptionSetupSession } from '../encryptionSetupStore';
import type { PendingRestoreCompletion } from '@/src/data/repositories/RestoreCompletionRepository';
import { asWorkplaceId } from '@/src/types/ids';

jest.mock('@/src/data/repositories/RestoreCompletionRepository', () => ({
  restoreCompletionRepository: {},
}));
jest.mock('@/src/data/repositories/account', () => ({ accountQueryRepository: {} }));
jest.mock('@/src/services/import/importAccountBalanceRebuild', () => ({
  rebuildAllAccountBalancesAfterImport: jest.fn(),
}));
jest.mock('@/src/services/preferences', () => ({ preferences: {} }));
jest.mock('../localKeyHierarchy', () => ({ localKeyHierarchy: {} }));
jest.mock('../encryptionSetupStore', () => ({ encryptionSetupStore: {} }));
jest.mock('../pendingEncryptedRestoreDeviceId', () => ({
  loadPendingEncryptedRestoreDeviceId: jest.fn(),
  clearPendingEncryptedRestoreDeviceId: jest.fn(),
}));

const identity = {
  userId: 'user',
  registeredDeviceId: 'device',
  userKeyFingerprint: `sha256:${'a'.repeat(64)}`,
};
const envelope = {
  format: 'full-frills-key-envelope' as const,
  formatVersion: 1 as const,
  suite: 'HPKE-X25519-HKDF-SHA256-AES256GCM' as const,
  context: {
    purpose: 'user-workplace-dek' as const,
    userId: 'user',
    recipientKeyId: identity.userKeyFingerprint,
  },
  encapsulatedKey: 'b'.repeat(64),
  ciphertext: 'AA==',
};
const state: RestoreCompletionState = {
  formatVersion: 1,
  identity,
  manifestHash: 'c'.repeat(64),
  rowCount: 2,
  safeToSpendDays: 60,
  recoveryDraftId: 'draft',
  workplaceKeys: {
    format: 'full-frills-workplace-keys',
    formatVersion: 1,
    userId: 'user',
    workplaceId: 'workplace',
    userKeyFingerprint: identity.userKeyFingerprint,
    keyId: `sha256:${'d'.repeat(64)}`,
    memberEnvelope: envelope,
    recoveryEnvelope: envelope,
    recoveryPublicKey: 'e'.repeat(64),
    recoveryConfirmed: true,
  },
};

function harness() {
  let pending: PendingRestoreCompletion | null = {
    workplaceId: asWorkplaceId('workplace'),
    manifestHash: state.manifestHash,
    json: JSON.stringify(state),
  };
  let session: EncryptionSetupSession | null = null;
  let installed = false;
  const events: string[] = [];
  const dependencies = {
    repository: {
      observePending: () => of(pending ? [pending] : []),
      confirmPublication: jest.fn(async () => {
        events.push('durable');
      }),
      readPending: jest.fn(async () => (pending ? [pending] : [])),
      clear: jest.fn(async () => {
        events.push('clear');
        pending = null;
      }),
    },
    hierarchy: {
      preflightWorkplaceRestore: jest.fn(async () =>
        installed ? ('installed' as const) : ('installable' as const),
      ),
      installWorkplaceKeys: jest.fn(async () => {
        installed = true;
        events.push('keys');
      }),
      commitRestoreDraft: jest.fn(async () => {
        events.push('cleanup');
      }),
    },
    session: {
      loadSession: jest.fn(async () => session),
      saveSession: jest.fn(async (value: EncryptionSetupSession) => {
        events.push('session');
        session = value;
      }),
    },
    assertAccess: jest.fn(),
    updatePreferences: jest.fn(() => {
      events.push('preferences');
    }),
    rebuildBalances: jest.fn(async () => {
      events.push('balances');
    }),
    pendingDevice: { load: jest.fn(async () => 'device'), clear: jest.fn(async () => undefined) },
  };
  const onReady = jest.fn(async () => {
    events.push('launch');
  });
  return {
    dependencies,
    onReady,
    events,
    pending: () => pending,
    session: () => session,
    reopen: () => new EncryptedRestoreCompletion(dependencies),
  };
}

it('finishes a reconstructed handoff without archive access and clears it only after launch', async () => {
  const h = harness();
  await h.reopen().resume(h.onReady);
  expect(h.events).toEqual([
    'durable',
    'keys',
    'preferences',
    'balances',
    'session',
    'launch',
    'cleanup',
    'clear',
  ]);
  expect(h.pending()).toBeNull();
  expect(h.session()).toMatchObject({
    userId: 'user',
    deviceId: 'device',
    enrolledWorkplaces: ['workplace'],
  });
  await h.reopen().resume(h.onReady);
  expect(h.onReady).toHaveBeenCalledTimes(1);
});

it.each(['keys', 'balances', 'session', 'launch', 'acknowledgement'] as const)(
  'keeps published recovery resumable after %s fails without reinstalling established keys',
  async boundary => {
    const h = harness();
    const failure = new Error(boundary);
    const target = {
      keys: h.dependencies.hierarchy.installWorkplaceKeys,
      balances: h.dependencies.rebuildBalances,
      session: h.dependencies.session.saveSession,
      launch: h.onReady,
      acknowledgement: h.dependencies.repository.clear,
    }[boundary];
    target.mockRejectedValueOnce(failure);
    await expect(h.reopen().resume(h.onReady)).rejects.toBe(failure);
    expect(h.pending()).not.toBeNull();
    await h.reopen().resume(h.onReady);
    expect(h.pending()).toBeNull();
    expect(h.dependencies.hierarchy.installWorkplaceKeys).toHaveBeenCalledTimes(
      boundary === 'keys' ? 2 : 1,
    );
  },
);

it('requires a persistence acknowledgement before touching keys or setup', async () => {
  const h = harness();
  h.dependencies.repository.confirmPublication.mockRejectedValueOnce(new Error('save failed'));
  await expect(h.reopen().resume(h.onReady)).rejects.toThrow('save failed');
  expect(h.dependencies.hierarchy.preflightWorkplaceRestore).not.toHaveBeenCalled();
  expect(h.onReady).not.toHaveBeenCalled();
  expect(h.pending()).not.toBeNull();
});

it('rejects a handoff whose receipt was changed', async () => {
  const h = harness();
  h.dependencies.repository.readPending.mockResolvedValueOnce([
    { ...h.pending()!, manifestHash: 'f'.repeat(64) },
  ]);
  await expect(h.reopen().resume(h.onReady)).rejects.toThrow('published receipt');
  expect(h.dependencies.hierarchy.preflightWorkplaceRestore).not.toHaveBeenCalled();
});

it('preserves existing Workplace membership and verification', async () => {
  const h = harness();
  await h.dependencies.session.saveSession({
    formatVersion: 1,
    intent: 'create-user',
    userId: 'user',
    deviceId: 'device',
    userKeyFingerprint: identity.userKeyFingerprint,
    enrolledWorkplaces: ['other'],
    verifiedWorkplaces: [{ workplaceId: 'other', keyId: 'key' }],
  });
  await h.reopen().resume(h.onReady);
  expect(h.session()).toMatchObject({
    enrolledWorkplaces: ['other', 'workplace'],
    verifiedWorkplaces: [{ workplaceId: 'other', keyId: 'key' }],
  });
});

it('does not fail usable recovery when temporary checkpoint cleanup fails', async () => {
  const h = harness();
  h.dependencies.hierarchy.commitRestoreDraft.mockRejectedValueOnce(new Error('cleanup'));
  await h.reopen().resume(h.onReady);
  expect(h.pending()).toBeNull();
  expect(h.onReady).toHaveBeenCalledTimes(1);
  expect(h.dependencies.pendingDevice.clear).not.toHaveBeenCalled();
  await h.reopen().retryCleanup();
  expect(h.dependencies.hierarchy.commitRestoreDraft).toHaveBeenLastCalledWith(
    'user',
    'device',
    'device',
  );
  expect(h.dependencies.pendingDevice.clear).toHaveBeenCalledTimes(1);
});
