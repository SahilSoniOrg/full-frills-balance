// Test-only signing fixtures; private keys never enter production code.
import { generateKeyPairSync } from 'node:crypto';

export function generateUserSigningPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKey: new Uint8Array(publicKey.export({ type: 'spki', format: 'der' }).subarray(-32)),
    privateKey: new Uint8Array(privateKey.export({ type: 'pkcs8', format: 'der' })),
  };
}
if (process.env.NODE_ENV !== 'test') throw new Error('__FFB_JS_KEY_CRYPTO_TEST_ONLY__');
