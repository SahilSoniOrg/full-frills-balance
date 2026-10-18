/** Public setup progress only. Credentials and key material never enter this store. */
export interface EncryptionSetupSession {
  formatVersion: 1;
  intent: 'create-user' | 'recover-user';
  userId: string;
  deviceId: string;
  userKeyFingerprint?: string;
  enrolledWorkplaces?: string[];
  verifiedWorkplaces?: { workplaceId: string; keyId: string }[];
}
export interface EncryptionSetupStore {
  loadSession(): Promise<EncryptionSetupSession | null>;
  saveSession(value: EncryptionSetupSession): Promise<void>;
}
const unavailable = async (): Promise<never> => {
  throw new Error('Encryption setup requires a native device');
};
export const encryptionSetupStore: EncryptionSetupStore = {
  loadSession: async () => null,
  saveSession: unavailable,
};
