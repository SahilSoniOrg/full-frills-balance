import { LocalKeyHierarchy } from '@/src/testing/keyCryptoReference/localKeyHierarchy';
import type { KeyCiphertextStateStore } from '../keyCiphertextStateStore';
import type { DeviceKeyVault } from '@/src/testing/keyCryptoReference/deviceKeyVault';

export function memoryKeyHierarchy(assertAccess: () => void = () => undefined) {
  const ciphertext = new Map<string, unknown>();
  const deviceSecrets = new Map<string, Uint8Array>();
  const copy = (value: unknown) => JSON.parse(JSON.stringify(value));
  const state: KeyCiphertextStateStore = {
    read: jest.fn(async scope => (ciphertext.has(scope) ? copy(ciphertext.get(scope)) : null)),
    write: jest.fn(async (scope, value) => {
      ciphertext.set(scope, copy(value));
    }),
    remove: jest.fn(async scope => {
      ciphertext.delete(scope);
    }),
  };
  const deviceScope = (userId: string, deviceId: string) => JSON.stringify([userId, deviceId]);
  const vault: DeviceKeyVault = {
    load: jest.fn(async (userId, deviceId) => {
      const secret = deviceSecrets.get(deviceScope(userId, deviceId));
      return secret ? new Uint8Array(secret) : null;
    }),
    save: jest.fn(async (userId, deviceId, secret) => {
      const scope = deviceScope(userId, deviceId);
      if (deviceSecrets.has(scope)) throw new Error('Device private key already exists');
      deviceSecrets.set(scope, new Uint8Array(secret));
    }),
    remove: jest.fn(async (userId, deviceId) => {
      deviceSecrets.delete(deviceScope(userId, deviceId));
    }),
  };
  return {
    state,
    vault,
    ciphertext,
    deviceSecrets,
    hierarchy: new LocalKeyHierarchy(state, vault, assertAccess),
  };
}

export async function enrolledKeyHierarchy(workplaceId = 'snapshot-workplace') {
  const context = memoryKeyHierarchy();
  const userCredential = await context.hierarchy.beginUser('alice', 'phone');
  const identity = await context.hierarchy.confirmUserRecovery('alice', 'phone', userCredential);
  const workplaceCredential = await context.hierarchy.enrollWorkplace(
    identity,
    workplaceId,
    'local-upgrade',
  );
  await context.hierarchy.confirmWorkplaceRecovery(identity, workplaceId, workplaceCredential);
  return { ...context, identity, userCredential, workplaceCredential, workplaceId };
}
