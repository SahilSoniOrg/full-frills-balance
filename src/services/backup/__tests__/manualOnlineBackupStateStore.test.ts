import { randomBytes } from 'node:crypto';
import * as SecureStore from 'expo-secure-store';
import { manualBackupStateStore } from '../manualOnlineBackupStateStore.native';
import { encryptWorkplaceSnapshot } from '../encryptedSnapshot';
import type { PendingManualBackup, WorkplaceBackupConsent } from '../manualOnlineBackup';
import { resetDatabase } from '@/src/testing/resetDatabase';
import { enableTestCrypto, seedSnapshotWorkplace } from './snapshotTestHelpers';

const mockFiles = new Map<string, string>();
const mockSecure = new Map<string, string>();
let mockRenameFails = false;
jest.mock('react-native-quick-crypto', () => ({
  __esModule: true,
  default: {
    ...jest.requireActual('node:crypto'),
    Buffer: jest.requireActual('node:buffer').Buffer,
  },
}));
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only',
  getItemAsync: jest.fn(async key => mockSecure.get(key) ?? null),
  setItemAsync: jest.fn(async (key, value) => {
    mockSecure.set(key, value);
  }),
  deleteItemAsync: jest.fn(async key => {
    mockSecure.delete(key);
  }),
}));
jest.mock('expo-file-system', () => ({
  Paths: { document: 'documents' },
  File: class {
    path: string;
    constructor(...parts: string[]) {
      this.path = parts.join('/');
    }
    get name() {
      return this.path.split('/').pop()!;
    }
    get exists() {
      return mockFiles.has(this.path);
    }
    create(options: { overwrite?: boolean }) {
      if (this.exists && !options.overwrite) throw new Error('File already exists');
      mockFiles.set(this.path, '');
    }
    write(value: string) {
      if (!this.exists) throw new Error('File.create is required');
      mockFiles.set(this.path, value);
    }
    async text() {
      if (!this.exists) throw new Error('Missing file');
      return mockFiles.get(this.path)!;
    }
    rename(name: string) {
      if (mockRenameFails) throw new Error('Interrupted rename');
      const destination = 'documents/' + name;
      if (mockFiles.has(destination)) throw new Error('Cannot replace an immutable destination');
      mockFiles.set(destination, mockFiles.get(this.path)!);
      mockFiles.delete(this.path);
      this.path = destination;
    }
    delete() {
      mockFiles.delete(this.path);
    }
  },
}));
beforeEach(async () => {
  jest.clearAllMocks();
  mockFiles.clear();
  mockSecure.clear();
  mockRenameFails = false;
  enableTestCrypto();
  await resetDatabase();
});
async function pending() {
  const { snapshot } = await seedSnapshotWorkplace();
  const dek = new Uint8Array(randomBytes(32));
  const envelope = await encryptWorkplaceSnapshot(snapshot, dek);
  const item: PendingManualBackup = {
    userId: 'owner',
    workplaceId: envelope.workplaceId,
    userKeyFingerprint: 'anchor',
    registeredDeviceId: 'device',
    consentAcceptedAt: 1,
    envelope,
  };
  return { item, dek };
}
it('creates then atomically renames immutable ciphertext before committing a small secure pointer', async () => {
  const { item, dek } = await pending();
  await manualBackupStateStore.savePending(item);
  expect(await manualBackupStateStore.loadPending(item.userId, item.workplaceId)).toEqual(item);
  expect([...mockFiles.keys()]).toHaveLength(1);
  expect([...mockFiles.keys()][0]).not.toContain('.tmp');
  const stored = JSON.stringify([...mockFiles.values(), ...mockSecure.values()]);
  expect(stored).not.toContain(Buffer.from(dek).toString('hex'));
  expect(stored).not.toContain('Private books');
  expect([...mockSecure.values()][0].length).toBeLessThan(1024);
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(expect.any(String), expect.any(String), {
    keychainAccessible: 'device-only',
    requireAuthentication: false,
  });
});
it('failed rename cannot publish a truncated envelope or pointer', async () => {
  const { item } = await pending();
  mockRenameFails = true;
  await expect(manualBackupStateStore.savePending(item)).rejects.toThrow('Interrupted rename');
  expect(await manualBackupStateStore.loadPending(item.userId, item.workplaceId)).toBeNull();
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  mockRenameFails = false;
  await manualBackupStateStore.savePending(item);
  expect(await manualBackupStateStore.loadPending(item.userId, item.workplaceId)).toEqual(item);
});
it('pointer-write interruption retains original envelope and consent metadata; retry succeeds', async () => {
  const { item } = await pending();
  await manualBackupStateStore.savePending(item);
  jest.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error('Locked SecureStore'));
  await expect(
    manualBackupStateStore.savePending({ ...item, consentAcceptedAt: 2 }),
  ).rejects.toThrow('Locked');
  expect(await manualBackupStateStore.loadPending(item.userId, item.workplaceId)).toEqual(item);
  await manualBackupStateStore.savePending({ ...item, consentAcceptedAt: 2 });
  expect(await manualBackupStateStore.loadPending(item.userId, item.workplaceId)).toEqual({
    ...item,
    consentAcceptedAt: 2,
  });
});
it('refuses replacement, stale acknowledgement cleanup, cross-account access, and ciphertext tampering', async () => {
  const { item } = await pending();
  await manualBackupStateStore.savePending(item);
  await expect(
    manualBackupStateStore.savePending({
      ...item,
      envelope: { ...item.envelope, snapshotId: 'ab'.repeat(16) },
    }),
  ).rejects.toThrow('replacement');
  await expect(
    manualBackupStateStore.clearPending(item.userId, item.workplaceId, 'ab'.repeat(16)),
  ).rejects.toThrow('stale acknowledgement');
  expect(await manualBackupStateStore.loadPending('other-user', item.workplaceId)).toBeNull();
  const name = [...mockFiles.keys()][0];
  mockFiles.set(name, mockFiles.get(name)! + ' ');
  await expect(manualBackupStateStore.loadPending(item.userId, item.workplaceId)).rejects.toThrow(
    'integrity',
  );
});
it('persisted revocation cannot be overwritten by a later confirmation consent write', async () => {
  const { item } = await pending();
  const consent: WorkplaceBackupConsent = {
    userId: item.userId,
    workplaceId: item.workplaceId,
    userKeyFingerprint: item.userKeyFingerprint,
    registeredDeviceId: item.registeredDeviceId,
    consentedAt: 1,
  };
  await manualBackupStateStore.saveConsent({ ...consent, revokedAt: 3 });
  await expect(manualBackupStateStore.saveConsent(consent)).rejects.toThrow('silently reactivated');
  expect((await manualBackupStateStore.loadConsent(item.userId, item.workplaceId))?.revokedAt).toBe(
    3,
  );
});
