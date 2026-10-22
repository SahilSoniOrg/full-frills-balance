import { executeKeyCryptoWorker } from './keyCryptoWorkerClient.web';
import type { WebKeyCryptoCapability } from './webKeyCryptoCapability';

let cached: WebKeyCryptoCapability | undefined;

export async function probeWebKeyCryptoCapability(): Promise<WebKeyCryptoCapability> {
  if (cached) return cached;
  try {
    await executeKeyCryptoWorker('hasKey', {
      kind: 'device',
      userId: '00000000-0000-0000-0000-000000000001',
      deviceId: '00000000-0000-0000-0000-000000000002',
    });
    cached = 'ready';
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    cached = message === 'FFB_WASM_UNAVAILABLE' ? 'unavailable' : 'ready';
  }
  return cached;
}
