import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Directory, Paths } from 'expo-file-system';
import type { EncryptionSetupStore } from './encryptionSetupStore';
import { parseEncryptionSetupSession } from './encryptionSetupValidation';
import { MAX_RECOVERY_PACKAGE_BYTES } from './localRecoveryPackage';
import { snapshotCrypto } from './snapshotCryptoProvider';
import { keyHex } from './keyEncoding';
import { snapshotFingerprint } from './encryptedSnapshot';
import { KeyOperationError } from '@/src/utils/keyOperationError';

const SESSION = 'encryption_setup_session_v1';
const staged = new Set<string>();
function prunePackages(current?: string): void {
  try {
    for (const entry of new Directory(Paths.document).list()) {
      const match =
        entry instanceof File &&
        /^encrypted-recovery-([a-f0-9]{32})\.json(?:\.tmp)?$/.exec(entry.name);
      if (match && match[1] !== current && !staged.has(match[1])) {
        try {
          entry.delete();
        } catch {
          /* A later store operation retries cleanup. */
        }
      }
    }
  } catch {
    /* Cleanup is retried on the next store operation. */
  }
}
function file(id: string): File {
  if (!/^[a-f0-9]{32}$/.test(id)) throw new Error('Invalid recovery package reference');
  return new File(Paths.document, `encrypted-recovery-${id}.json`);
}
export const encryptionSetupStore: EncryptionSetupStore = {
  async loadSession() {
    const json = await AsyncStorage.getItem(SESSION);
    const session = json === null ? null : parseEncryptionSetupSession(JSON.parse(json));
    prunePackages(session?.package?.id);
    return session;
  },
  async saveSession(value) {
    try {
      await AsyncStorage.setItem(SESSION, JSON.stringify(parseEncryptionSetupSession(value)));
    } catch (error) {
      if (value.package && staged.has(value.package.id)) {
        try {
          const current = await AsyncStorage.getItem(SESSION);
          const reference =
            current === null
              ? undefined
              : parseEncryptionSetupSession(JSON.parse(current)).package?.id;
          if (reference !== value.package.id) {
            staged.delete(value.package.id);
            prunePackages(reference);
          }
        } catch {
          /* An ambiguous checkpoint keeps its ciphertext until a later read can resolve it. */
        }
      }
      throw error;
    }
    if (value.package) staged.delete(value.package.id);
    prunePackages(value.package?.id);
  },
  async writePackage(value) {
    const json = JSON.stringify(value);
    if (new TextEncoder().encode(json).length > MAX_RECOVERY_PACKAGE_BYTES)
      throw new Error('Encrypted package is too large');
    const id = keyHex(snapshotCrypto.randomBytes(16));
    staged.add(id);
    const temporary = new File(Paths.document, `encrypted-recovery-${id}.json.tmp`);
    try {
      temporary.create();
      temporary.write(json);
      temporary.rename(`encrypted-recovery-${id}.json`);
      const fingerprint = await snapshotFingerprint(json);
      if ((await snapshotFingerprint(await file(id).text())) !== fingerprint)
        throw new Error('Recovery package readback failed');
      return { id, fingerprint, workplaceId: value.workplaceKeys.workplaceId, confirmed: false };
    } catch (error) {
      staged.delete(id);
      try {
        if (temporary.exists) temporary.delete();
        if (file(id).exists) file(id).delete();
      } catch {
        /* Next store read retries orphan cleanup. */
      }
      throw error;
    }
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
