if (process.env.NODE_ENV !== 'test') throw new Error('__FFB_JS_KEY_CRYPTO_TEST_ONLY__');

export interface DeviceKeyVault {
  load(userId: string, deviceId: string): Promise<Uint8Array | null>;
  save(userId: string, deviceId: string, privateKey: Uint8Array): Promise<void>;
  remove(userId: string, deviceId: string): Promise<void>;
}
const unavailable = async (): Promise<never> => {
  throw new Error('Device key storage requires Android or iOS SecureStore');
};
export const deviceKeyVault: DeviceKeyVault = {
  load: unavailable,
  save: unavailable,
  remove: unavailable,
};
