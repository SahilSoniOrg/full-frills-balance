import * as SecureStore from 'expo-secure-store';
import type { DeviceKeyVault } from './deviceKeyVault';
import { snapshotFingerprint } from './encryptedSnapshot';
import { keyBytes, keyHex } from './keyEncoding';

const OPTIONS = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  requireAuthentication: false,
}; // Deliberate V1 choice: the existing app-lock policy gates use.
let queue: Promise<unknown> = Promise.resolve();
async function name(userId: string, deviceId: string): Promise<string> {
  if (!userId.trim() || !deviceId.trim()) throw new Error('Invalid Device key scope');
  return `device_private_key_v1_${(await snapshotFingerprint(JSON.stringify([userId, deviceId]))).slice(7)}`;
}
function exclusive<T>(operation: () => Promise<T>): Promise<T> {
  const next = queue.catch(() => undefined).then(operation);
  queue = next.catch(() => undefined);
  return next;
}
export const deviceKeyVault: DeviceKeyVault = {
  async load(userId, deviceId) {
    const stored = await SecureStore.getItemAsync(await name(userId, deviceId), OPTIONS);
    return stored === null ? null : keyBytes(stored);
  },
  save(userId, deviceId, privateKey) {
    // Copy before the await so a caller cannot mutate the pending write.
    if (privateKey.length !== 32) return Promise.reject(new Error('Invalid Device private key'));
    const encoded = keyHex(privateKey);
    return exclusive(async () => {
      const key = await name(userId, deviceId);
      const existing = await SecureStore.getItemAsync(key, OPTIONS);
      if (existing !== null && existing !== encoded)
        throw new Error('Device key replacement requires explicit removal');
      if (existing === encoded) return;
      await SecureStore.setItemAsync(key, encoded, OPTIONS);
      if ((await SecureStore.getItemAsync(key, OPTIONS)) !== encoded)
        throw new Error('Device key readback failed');
    });
  },
  remove(userId, deviceId) {
    return exclusive(async () =>
      SecureStore.deleteItemAsync(await name(userId, deviceId), OPTIONS),
    );
  },
};
