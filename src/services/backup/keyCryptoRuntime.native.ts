import { install } from 'react-native-quick-crypto';

/** Install the existing native Web Crypto adapter only when the runtime lacks one. */
export function ensureKeyCrypto(): void {
  if (!globalThis.crypto?.subtle) install();
  if (!globalThis.crypto?.subtle || !globalThis.crypto.getRandomValues)
    throw new Error('Secure key cryptography is unavailable');
}
