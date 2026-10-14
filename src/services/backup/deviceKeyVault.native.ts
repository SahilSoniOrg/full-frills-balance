import { nativeKeyOperations } from './nativeKeyOperations';
import type { DeviceKeyVault } from './deviceKeyVault';

export const deviceKeyVault: DeviceKeyVault = {
  async has(userId, deviceId) {
    const result = await nativeKeyOperations.hasKey({ kind: 'device', userId, deviceId });
    if (typeof result !== 'boolean') throw new Error('Invalid native vault result');
    return result;
  },
  async remove(userId, deviceId) {
    await nativeKeyOperations.removeKey({ kind: 'device', userId, deviceId });
  },
};
