/** Dedicated worker entry. It owns the WASM heap; messages contain key handles and requests only. */

import { ffbVaultHooks } from './webVault';
import createKeyCryptoModule from './dist/key-crypto.mjs';
import {
  createKeyCryptoWorkerRuntime,
  type WasmModule,
  type WorkerResponse,
} from './keyCryptoWorkerRuntime';

type WorkerScope = {
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  postMessage(message: WorkerResponse): void;
};

function isRequest(value: unknown): value is import('./keyCryptoWorkerRuntime').WorkerRequest {
  if (!value || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;
  if (typeof message.id !== 'string' || !message.id) return false;
  if (message.type === 'setAllowed') return typeof message.allowed === 'boolean';
  return (
    message.type === 'execute' &&
    typeof message.operation === 'string' &&
    Object.hasOwn(message, 'request')
  );
}

type KeyCryptoWasmFactory = (options?: {
  locateFile?: (file: string) => string;
  ffbVault?: typeof ffbVaultHooks;
}) => Promise<WasmModule>;

async function loadWasm(): Promise<WasmModule> {
  const factory = createKeyCryptoModule as unknown as KeyCryptoWasmFactory;
  if (typeof factory !== 'function') throw new Error('FFB_WASM_UNAVAILABLE');
  return factory({
    locateFile: (file: string) => new URL(`./dist/${file}`, import.meta.url).href,
    ffbVault: ffbVaultHooks,
  });
}

/** Called by the generated worker entry; never expose the module or memory to the page. */
export function workerBootstrap(scope: WorkerScope) {
  let modulePromise: Promise<WasmModule> | undefined;
  const getModule = () => (modulePromise ??= loadWasm());
  const runtime = createKeyCryptoWorkerRuntime({
    getModule,
    postMessage: response => scope.postMessage(response),
  });

  scope.addEventListener('message', event => {
    const message: unknown = event.data;
    if (!isRequest(message)) return;
    runtime.onRequest(message);
  });
}
