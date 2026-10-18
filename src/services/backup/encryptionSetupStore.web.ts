import type { EncryptionSetupStore, EncryptionSetupSession } from './encryptionSetupStore';
import { parseEncryptionSetupSession } from './encryptionSetupValidation';

const STORAGE_KEY = 'ffb-encryption-setup-session-v1';

export const encryptionSetupStore: EncryptionSetupStore = {
  async loadSession(): Promise<EncryptionSetupSession | null> {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    return parseEncryptionSetupSession(JSON.parse(raw));
  },
  async saveSession(value: EncryptionSetupSession): Promise<void> {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  },
};
