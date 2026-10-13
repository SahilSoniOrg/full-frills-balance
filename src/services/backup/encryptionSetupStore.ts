import type { LocalRecoveryPackage } from './localRecoveryPackage';

export interface PendingRecoveryPackage {
  id: string;
  workplaceId: string;
  fingerprint: string;
  confirmed: boolean;
}
/** Public progress only. Never add a credential, phrase, private key or readable snapshot here. */
export interface EncryptionSetupSession {
  formatVersion: 1;
  intent: 'create-user' | 'recover-user';
  userId: string;
  deviceId: string;
  userKeyFingerprint?: string;
  package?: PendingRecoveryPackage;
}
export interface EncryptionSetupStore {
  loadSession(): Promise<EncryptionSetupSession | null>;
  saveSession(value: EncryptionSetupSession): Promise<void>;
  writePackage(value: LocalRecoveryPackage): Promise<PendingRecoveryPackage>;
  readPackage(reference: PendingRecoveryPackage): Promise<LocalRecoveryPackage>;
}
const unavailable = async (): Promise<never> => {
  throw new Error('Encryption setup requires a native device');
};
export const encryptionSetupStore: EncryptionSetupStore = {
  loadSession: unavailable,
  saveSession: unavailable,
  writePackage: unavailable,
  readPackage: unavailable,
};
