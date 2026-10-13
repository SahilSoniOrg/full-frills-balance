import * as SecureStore from 'expo-secure-store';
import { deviceKeyVault } from '../deviceKeyVault.native';
import { enableTestCrypto } from './snapshotTestHelpers';
const mockKeys = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only',
  getItemAsync: jest.fn(async key => mockKeys.get(key) ?? null),
  setItemAsync: jest.fn(async (key, value) => {
    mockKeys.set(key, value);
  }),
  deleteItemAsync: jest.fn(async key => {
    mockKeys.delete(key);
  }),
}));
jest.mock('react-native-quick-crypto', () => ({
  __esModule: true,
  default: {
    ...jest.requireActual('node:crypto'),
    Buffer: jest.requireActual('node:buffer').Buffer,
  },
}));
beforeEach(() => {
  mockKeys.clear();
  jest.clearAllMocks();
  enableTestCrypto();
});
it('persists only the Device private key and isolates Users and installations', async () => {
  const key = new Uint8Array(32).fill(17);
  await deviceKeyVault.save('alice', 'phone', key);
  await deviceKeyVault.save('alice', 'phone', key);
  expect(await deviceKeyVault.load('alice', 'phone')).toEqual(key);
  expect(await deviceKeyVault.load('bob', 'phone')).toBeNull();
  expect(await deviceKeyVault.load('alice', 'replacement')).toBeNull();
  expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(1);
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
    expect.stringMatching(/^device_private_key_v1_/),
    '11'.repeat(32),
    { keychainAccessible: 'device-only', requireAuthentication: false },
  );
});
it('serializes saves, rejects implicit replacement, and clears secrets on logout', async () => {
  const results = await Promise.allSettled([
    deviceKeyVault.save('alice', 'phone', new Uint8Array(32).fill(1)),
    deviceKeyVault.save('alice', 'phone', new Uint8Array(32).fill(2)),
  ]);
  expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected']);
  await deviceKeyVault.remove('alice', 'phone');
  expect(await deviceKeyVault.load('alice', 'phone')).toBeNull();
});
it('propagates storage failures without substituting a key and verifies durable readback', async () => {
  jest.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error('locked'));
  await expect(deviceKeyVault.save('alice', 'phone', new Uint8Array(32))).rejects.toThrow('locked');
  expect(await deviceKeyVault.load('alice', 'phone')).toBeNull();
  jest.mocked(SecureStore.setItemAsync).mockResolvedValueOnce();
  await expect(deviceKeyVault.save('alice', 'phone', new Uint8Array(32))).rejects.toThrow(
    'readback',
  );
});
