import { nativeKeyOperations } from './nativeKeyOperations';
import type { DeviceKeyVault } from './deviceKeyVault';

export const deviceKeyVault: DeviceKeyVault = {
  async has(userId, deviceId) {
    const result = await nativeKeyOperations.execute('hasDevice', { userId, deviceId });
    if (typeof result !== 'boolean') throw new Error('Invalid native vault result');
    return result;
  },
  async remove(userId, deviceId) {
    await nativeKeyOperations.execute('removeDevice', { userId, deviceId });
  },
};
