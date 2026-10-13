import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import type { KeyCiphertextStateStore } from './keyCiphertextStateStore';
import { snapshotFingerprint } from './encryptedSnapshot';
import { snapshotCrypto } from './snapshotCryptoProvider';
import { keyHex } from './keyEncoding';
import { MissingKeyStateError } from './keyStateErrors';

async function index(scope: string): Promise<string> {
  return `key_ciphertext_v1_${(await snapshotFingerprint(scope)).slice(7)}`;
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
export const keyCiphertextStateStore: KeyCiphertextStateStore = {
  async read(scope) {
    const saved = await pointer(scope);
    if (!saved) return null;
    const input = file(saved.name);
    if (!input.exists) throw new MissingKeyStateError();
    if (input.size > 64 * 1024) throw new Error('Oversized encrypted key state');
    const json = await input.text();
    if ((await snapshotFingerprint(json)) !== saved.hash)
      throw new Error('Encrypted key state integrity mismatch');
    return JSON.parse(json);
  },
  async write(scope, value) {
    const json = JSON.stringify(value);
    if (new TextEncoder().encode(json).length > 64 * 1024)
      throw new Error('Encrypted key state is oversized');
    const name = `key-ciphertext-${keyHex(snapshotCrypto.randomBytes(16))}.json`;
    const temporary = new File(Paths.document, `${name}.tmp`);
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
        hash: await snapshotFingerprint(json),
      }),
    );
    // Older files remain ciphertext. Orphan cleanup and native power-loss durability are release gates.
  },
  async remove(scope) {
    const saved = await pointer(scope);
    await AsyncStorage.removeItem(await index(scope));
    if (saved && file(saved.name).exists) file(saved.name).delete();
  },
};
