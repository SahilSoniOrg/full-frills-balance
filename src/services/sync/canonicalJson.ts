// Compatibility API: canonical data operations live separately from platform hashing.
import { canonicalJsonBytes } from './canonicalJsonData';
import { cryptoProvider } from '../backup/cryptoProvider';
import { keyHex } from '../backup/keyEncoding';
export * from './canonicalJsonData';

export async function contentHash(value: unknown): Promise<string> {
  return keyHex(await cryptoProvider.digest(canonicalJsonBytes(value)));
}
