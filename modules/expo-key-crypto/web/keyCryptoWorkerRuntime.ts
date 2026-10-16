export type WasmModule = {
  ccall: (
    name: string,
    returnType: 'number' | 'void',
    argumentTypes: ('string' | 'number')[],
    args: (string | number)[],
    options?: { async?: boolean },
  ) => number | void | Promise<number>;
  UTF8ToString(pointer: number): string;
  _free(pointer: number): void;
};

export type WorkerRequest =
  | { readonly id: string; readonly type: 'setAllowed'; readonly allowed: boolean }
  | {
      readonly id: string;
      readonly type: 'execute';
      readonly operation: string;
      readonly request: unknown;
    };

export type WorkerResponse =
  | { readonly id: string; readonly ok: true; readonly result?: unknown }
  | { readonly id: string; readonly ok: false; readonly error: string };

type ExecuteJob = {
  readonly id: string;
  readonly operation: string;
  readonly request: unknown;
};

async function invokeExecute(
  wasm: WasmModule,
  operation: string,
  request: unknown,
): Promise<number> {
  const raw = wasm.ccall(
    'ffb_key_crypto_execute',
    'number',
    ['string', 'string'],
    [operation, JSON.stringify(request)],
    { async: true },
  );
  const pointer = await Promise.resolve(raw);
  if (typeof pointer !== 'number' || pointer === 0) throw new Error('FFB_OPERATION_FAILED');
  return pointer;
}

function parseExecutePointer(
  wasm: WasmModule,
  pointer: number,
):
  | { readonly ok: true; readonly result?: unknown }
  | { readonly ok: false; readonly error: string } {
  try {
    const json: unknown = JSON.parse(wasm.UTF8ToString(pointer));
    const error =
      json && typeof json === 'object' && 'error' in json && typeof json.error === 'string'
        ? json.error
        : undefined;
    if (error) return { ok: false, error };
    return { ok: true, result: json };
  } finally {
    wasm._free(pointer);
  }
}

export function createKeyCryptoWorkerRuntime(deps: {
  getModule: () => Promise<WasmModule>;
  postMessage: (response: WorkerResponse) => void;
}) {
  const executeQueue: ExecuteJob[] = [];
  let pumpRunning = false;
  let locked = false;

  function rejectQueuedExecutes() {
    while (executeQueue.length > 0) {
      const job = executeQueue.shift()!;
      deps.postMessage({ id: job.id, ok: false, error: 'FFB_KEY_LOCKED' });
    }
  }

  async function runExecute(job: ExecuteJob): Promise<void> {
    if (locked) {
      deps.postMessage({ id: job.id, ok: false, error: 'FFB_KEY_LOCKED' });
      return;
    }
    let pointer: number | undefined;
    try {
      const wasm = await deps.getModule();
      pointer = await invokeExecute(wasm, job.operation, job.request);
      const parsed = parseExecutePointer(wasm, pointer);
      pointer = undefined;
      deps.postMessage(
        parsed.ok
          ? { id: job.id, ok: true, result: parsed.result }
          : { id: job.id, ok: false, error: parsed.error },
      );
    } catch (error) {
      if (pointer !== undefined) {
        try {
          const wasm = await deps.getModule();
          wasm._free(pointer);
        } catch {
          // ignore double-free during teardown
        }
      }
      const code = error instanceof Error ? error.message : 'FFB_OPERATION_FAILED';
      deps.postMessage({
        id: job.id,
        ok: false,
        error: /^FFB_[A-Z_]+$/.test(code) ? code : 'FFB_OPERATION_FAILED',
      });
    }
  }

  async function pumpExecuteQueue(): Promise<void> {
    if (pumpRunning) return;
    pumpRunning = true;
    try {
      while (executeQueue.length > 0 && !locked) {
        const job = executeQueue.shift()!;
        await runExecute(job);
      }
      if (locked) rejectQueuedExecutes();
    } finally {
      pumpRunning = false;
      if (executeQueue.length > 0 && !locked) void pumpExecuteQueue();
    }
  }

  async function handleSetAllowed(message: Extract<WorkerRequest, { type: 'setAllowed' }>) {
    const wasm = await deps.getModule();
    wasm.ccall('ffb_key_crypto_set_allowed', 'void', ['number'], [Number(message.allowed)]);
    locked = !message.allowed;
    if (locked) rejectQueuedExecutes();
    deps.postMessage({ id: message.id, ok: true });
  }

  function handleExecute(message: Extract<WorkerRequest, { type: 'execute' }>) {
    executeQueue.push({
      id: message.id,
      operation: message.operation,
      request: message.request,
    });
    void pumpExecuteQueue();
  }

  function onRequest(message: WorkerRequest) {
    if (message.type === 'setAllowed') {
      void handleSetAllowed(message).catch(error => {
        const code = error instanceof Error ? error.message : 'FFB_OPERATION_FAILED';
        deps.postMessage({
          id: message.id,
          ok: false,
          error: /^FFB_[A-Z_]+$/.test(code) ? code : 'FFB_OPERATION_FAILED',
        });
      });
      return;
    }
    handleExecute(message);
  }

  return { onRequest };
}
