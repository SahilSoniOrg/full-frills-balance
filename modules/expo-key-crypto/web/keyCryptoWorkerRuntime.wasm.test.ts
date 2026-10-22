import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  createKeyCryptoWorkerRuntime,
  type WasmModule,
  type WorkerResponse,
} from './keyCryptoWorkerRuntime';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

const distDir = path.join(moduleDir, 'dist');
const wasmArtifactReady =
  existsSync(path.join(distDir, 'key-crypto.wasm')) &&
  !readFileSync(path.join(distDir, 'key-crypto.mjs'), 'utf8').includes('Runtime placeholder until');

function waitForResponse(
  responses: WorkerResponse[],
  id: string,
  timeoutMs = 30_000,
): Promise<WorkerResponse> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      const hit = responses.find(entry => entry.id === id);
      if (hit) return resolve(hit);
      if (Date.now() - started > timeoutMs) {
        return reject(new Error(`Timed out waiting for worker response ${id}`));
      }
      setTimeout(tick, 10);
    };
    tick();
  });
}

(wasmArtifactReady ? describe : describe.skip)('wasm worker vault integration', () => {
  it('round-trips device key creation through delayed vault I/O', async () => {
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const vaultStore = new Map<string, Uint8Array>();
    const vault = {
      load: async (name: string) => {
        await sleep(20);
        const value = vaultStore.get(name);
        return value ? new Uint8Array(value) : null;
      },
      save: async (name: string, bytes: Uint8Array) => {
        await sleep(20);
        vaultStore.set(name, bytes.slice());
      },
      remove: async (name: string) => {
        vaultStore.delete(name);
      },
    };
    const loaderUrl = pathToFileURL(path.join(distDir, 'key-crypto.mjs')).href;
    const { default: createModule } = await import(loaderUrl);
    const wasm = (await createModule({
      locateFile: (file: string) => path.join(distDir, file),
      ffbVault: vault,
    })) as WasmModule;
    wasm.ccall('ffb_key_crypto_set_allowed', 'void', ['number'], [1]);
    const responses: WorkerResponse[] = [];
    const runtime = createKeyCryptoWorkerRuntime({
      getModule: async () => wasm,
      postMessage: response => responses.push(response),
    });
    runtime.onRequest({
      id: 'device',
      type: 'execute',
      operation: 'generateKeys',
      request: { kind: 'device', userId: 'wasm-user', deviceId: 'wasm-device' },
    });
    const device = await waitForResponse(responses, 'device');
    if (!device.ok) throw new Error(`generateKeys failed: ${device.error}`);
    runtime.onRequest({
      id: 'user',
      type: 'execute',
      operation: 'generateKeys',
      request: { kind: 'user', device: (device as { ok: true; result: unknown }).result },
    });
    const user = await waitForResponse(responses, 'user');
    if (!user.ok) throw new Error(`user generateKeys failed: ${user.error}`);
    expect(user.ok).toBe(true);
    expect(vaultStore.size).toBeGreaterThan(0);
  });
});
