type WorkerRequest =
  | { readonly id: string; readonly type: 'setAllowed'; readonly allowed: boolean }
  | {
      readonly id: string;
      readonly type: 'execute';
      readonly operation: string;
      readonly request: unknown;
    };

type WorkerResponse =
  | { readonly id: string; readonly ok: true; readonly result?: unknown }
  | { readonly id: string; readonly ok: false; readonly error: string };

let worker: Worker | undefined;
let nextId = 0;
const pending = new Map<
  string,
  { readonly resolve: (value: unknown) => void; readonly reject: (error: Error) => void }
>();

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./keyCrypto.worker.web.ts', import.meta.url));
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const message = event.data;
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.ok) entry.resolve(message.result);
    else entry.reject(new Error(message.error));
  };
  worker.onerror = () => {
    for (const [, entry] of pending) entry.reject(new Error('FFB_WASM_UNAVAILABLE'));
    pending.clear();
  };
  return worker;
}

function postMessage(message: WorkerRequest): Promise<unknown> {
  return new Promise((resolve, reject) => {
    pending.set(message.id, { resolve, reject });
    ensureWorker().postMessage(message);
  });
}

export function setKeyCryptoWorkerAllowed(allowed: boolean): void {
  const id = `allow-${++nextId}`;
  void postMessage({ id, type: 'setAllowed', allowed }).catch(() => undefined);
}

export async function executeKeyCryptoWorker(
  operation: string,
  request: unknown,
): Promise<unknown> {
  const id = `op-${++nextId}`;
  return postMessage({ id, type: 'execute', operation, request });
}
