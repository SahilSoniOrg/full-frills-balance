import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import type { EncryptionSetupStore } from './encryptionSetupStore';
import { parseEncryptionSetupSession } from './encryptionSetupValidation';
import { MAX_RECOVERY_PACKAGE_BYTES } from './localRecoveryPackage';
import { snapshotCrypto } from './snapshotCryptoProvider';
import { keyHex } from './keyEncoding';
import { snapshotFingerprint } from './encryptedSnapshot';
import { KeyOperationError } from '@/src/utils/keyOperationError';

const SESSION = 'encryption_setup_session_v1';
function file(id: string): File {
  if (!/^[a-f0-9]{32}$/.test(id)) throw new Error('Invalid recovery package reference');
  return new File(Paths.document, `encrypted-recovery-${id}.json`);
}
export const encryptionSetupStore: EncryptionSetupStore = {
  async loadSession() {
    const json = await AsyncStorage.getItem(SESSION);
    return json === null ? null : parseEncryptionSetupSession(JSON.parse(json));
  },
  async saveSession(value) {
    await AsyncStorage.setItem(SESSION, JSON.stringify(parseEncryptionSetupSession(value)));
  },
  async writePackage(value) {
    const json = JSON.stringify(value);
    if (new TextEncoder().encode(json).length > MAX_RECOVERY_PACKAGE_BYTES)
      throw new Error('Encrypted package is too large');
    const id = keyHex(snapshotCrypto.randomBytes(16));
    const temporary = new File(Paths.document, `encrypted-recovery-${id}.json.tmp`);
    temporary.create();
    temporary.write(json);
    temporary.rename(`encrypted-recovery-${id}.json`);
    const fingerprint = await snapshotFingerprint(json);
    if ((await snapshotFingerprint(await file(id).text())) !== fingerprint)
      throw new Error('Recovery package readback failed');
    return { id, fingerprint, workplaceId: value.workplaceKeys.workplaceId, confirmed: false };
  },
  async readPackage(reference) {
    const input = file(reference.id);
    if (!input.exists || input.size > MAX_RECOVERY_PACKAGE_BYTES)
      throw new KeyOperationError(
        'FFB_KEY_PACKAGE_UNAVAILABLE',
        'Encrypted recovery package is unavailable',
      );
    const json = await input.text();
    if ((await snapshotFingerprint(json)) !== reference.fingerprint)
      throw new KeyOperationError('FFB_KEY_INVALID_FILE', 'Recovery package integrity mismatch');
    return JSON.parse(json);
  },
};
