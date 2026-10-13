/** Native vault metadata and removal only. No private-key bytes cross this interface. */
export interface DeviceKeyVault {
  has(userId: string, deviceId: string): Promise<boolean>;
  remove(userId: string, deviceId: string): Promise<void>;
}
const unavailable = async (): Promise<never> => {
  throw new Error('Device vault access requires the native crypto module');
};
export const deviceKeyVault: DeviceKeyVault = { has: unavailable, remove: unavailable };
