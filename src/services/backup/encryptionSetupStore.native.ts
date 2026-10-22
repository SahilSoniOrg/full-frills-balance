import AsyncStorage from '@react-native-async-storage/async-storage';
import type { EncryptionSetupStore } from './encryptionSetupStore';
import { parseEncryptionSetupSession } from './encryptionSetupValidation';

const SESSION = 'encryption_setup_session_v1';
export const encryptionSetupStore: EncryptionSetupStore = {
  async loadSession() {
    const json = await AsyncStorage.getItem(SESSION);
    return json === null ? null : parseEncryptionSetupSession(JSON.parse(json));
  },
  async saveSession(value) {
    await AsyncStorage.setItem(SESSION, JSON.stringify(parseEncryptionSetupSession(value)));
  },
};
