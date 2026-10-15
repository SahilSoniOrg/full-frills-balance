import { parseObject, isSha256Id } from '@/src/utils/strictObject';
import { SerialQueue } from '@/src/utils/serialQueue';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Directory, Paths } from 'expo-file-system';
import type { KeyCiphertextStateStore } from './keyCiphertextStateStore';
import { sha256Fingerprint } from './fingerprints';
import { snapshotCrypto } from './snapshotCryptoProvider';
import { keyHex } from './keyEncoding';
import { MissingKeyStateError } from '@/src/utils/keyOperationError';

async function index(scope: string): Promise<string> {
  return `key_ciphertext_v1_${(await sha256Fingerprint(scope)).slice(7)}`;
}
function file(name: string): File {
  if (!/^key-ciphertext-[a-f0-9]{32}\.json$/.test(name))
    throw new Error('Invalid key ciphertext file');
  return new File(Paths.document, name);
}
async function pointer(scope: string): Promise<{ name: string; hash: string } | null> {
  const stored = await AsyncStorage.getItem(await index(scope));
  if (stored === null) return null;
  const raw: unknown = JSON.parse(stored);
  if (
    !raw ||
    typeof raw !== 'object' ||
    !('name' in raw) ||
    !('hash' in raw) ||
    typeof raw.name !== 'string' ||
    typeof raw.hash !== 'string'
  )
    throw new Error('Invalid key ciphertext pointer');
  file(raw.name);
  return { name: raw.name, hash: raw.hash };
}
const queue = new SerialQueue();
let cleaned = false;
async function pruneAbandonedFiles(): Promise<void> {
  if (cleaned) return;
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter(key =>
      key.startsWith('key_ciphertext_v1_'),
    );
    const locators = await AsyncStorage.multiGet(keys);
    const live = new Set(
      locators.flatMap(([, value]) => {
        if (value === null) return [];
        const locator = parseObject(JSON.parse(value), 'Invalid ciphertext locator');
        if (typeof locator.name !== 'string' || !isSha256Id(locator.hash))
          throw new Error('Invalid ciphertext locator');
        file(locator.name);
        return [locator.name];
      }),
    );
    for (const entry of new Directory(Paths.document).list()) {
      if (
        entry instanceof File &&
        /^key-ciphertext-[a-f0-9]{32}\.json(?:\.tmp)?$/.test(entry.name) &&
        !live.has(entry.name)
      )
        entry.delete();
    }
    cleaned = true;
  } catch {
    /* Cleanup never determines key availability; retry after a later operation. */
  }
}
export const keyCiphertextStateStore: KeyCiphertextStateStore = {
  read: scope =>
    queue.run(async () => {
      await pruneAbandonedFiles();
      const saved = await pointer(scope);
      if (!saved) return null;
      const input = file(saved.name);
      if (!input.exists) throw new MissingKeyStateError();
      if (input.size > 64 * 1024) throw new Error('Oversized encrypted key state');
      const json = await input.text();
      if ((await sha256Fingerprint(json)) !== saved.hash)
        throw new Error('Encrypted key state integrity mismatch');
      return JSON.parse(json);
    }),
  write: (scope, value) =>
    queue.run(async () => {
      await pruneAbandonedFiles();
      const previous = await pointer(scope);
      const json = JSON.stringify(value);
      if (new TextEncoder().encode(json).length > 64 * 1024)
        throw new Error('Encrypted key state is oversized');
      const name = `key-ciphertext-${keyHex(snapshotCrypto.randomBytes(16))}.json`;
      const temporary = new File(Paths.document, `${name}.tmp`);
      try {
        temporary.create();
        temporary.write(json);
        temporary.rename(name);
        // Publish immutable ciphertext through a nonsecret, app-backed locator.
        // Device-only Keychain loss must not make surviving app files undiscoverable.
        // AsyncStorage commits the pointer separately; no cross-store transaction is claimed.
        await AsyncStorage.setItem(
          await index(scope),
          JSON.stringify({
            name,
            hash: await sha256Fingerprint(json),
          }),
        );
      } catch (error) {
        cleaned = false;
        // A rejected pointer write can be ambiguous. Never delete a file its locator names.
        try {
          if ((await pointer(scope))?.name !== name && temporary.exists) temporary.delete();
        } catch {
          /* Keep uncertain ciphertext for the next cleanup pass. */
        }
        throw error;
      }
      if (previous) {
        try {
          const obsolete = file(previous.name);
          if (obsolete.exists) obsolete.delete();
        } catch {
          /* Retry cleanup at the next write. */
        }
      }
    }),
  remove: scope =>
    queue.run(async () => {
      await pruneAbandonedFiles();
      const saved = await pointer(scope);
      await AsyncStorage.removeItem(await index(scope));
      if (saved && file(saved.name).exists) file(saved.name).delete();
    }),
};
