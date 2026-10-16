import {
  createKeyCryptoWorkerRuntime,
  type WasmModule,
  type WorkerResponse,
} from './keyCryptoWorkerRuntime';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createMockWasm(handlers: {
  execute?: (operation: string, request: string) => number | Promise<number> | Error;
  setAllowed?: (allowed: number) => void;
}): WasmModule {
  const allocations = new Map<number, string>();
  let nextPtr = 1;
  return {
    ccall(name, returnType, _types, args, options) {
      if (name === 'ffb_key_crypto_set_allowed') {
        handlers.setAllowed?.(args[0] as number);
        return undefined;
      }
      if (name !== 'ffb_key_crypto_execute' || returnType !== 'number') {
        throw new Error('unexpected ccall');
      }
      const run = () => {
        const outcome = handlers.execute?.(args[0] as string, args[1] as string);
        if (outcome instanceof Error) throw outcome;
        if (typeof outcome === 'number') return outcome;
        return outcome ?? 0;
      };
      if (options?.async) return Promise.resolve().then(run);
      const value = run();
      return typeof value === 'number' ? value : 0;
    },
    UTF8ToString(pointer: number) {
      return allocations.get(pointer) ?? '';
    },
    _free(pointer: number) {
      allocations.delete(pointer);
    },
    __alloc(json: string) {
      const pointer = nextPtr++;
      allocations.set(pointer, json);
      return pointer;
    },
  } as WasmModule & { __alloc(json: string): number };
}

function collectResponses(postMessage: (response: WorkerResponse) => void) {
  const responses: WorkerResponse[] = [];
  return {
    responses,
    postMessage: (response: WorkerResponse) => {
      responses.push(response);
      postMessage(response);
    },
  };
}

describe('keyCryptoWorkerRuntime', () => {
  it('does not reject unlocked startup work when an earlier lock waits for WASM', async () => {
    const ready = deferred<WasmModule>();
    const transitions: number[] = [];
    const wasm = createMockWasm({
      setAllowed: allowed => transitions.push(allowed),
      execute: () => (wasm as WasmModule & { __alloc: (j: string) => number }).__alloc('{}'),
    });
    const inbox = collectResponses(() => undefined);
    const runtime = createKeyCryptoWorkerRuntime({
      getModule: () => ready.promise,
      postMessage: inbox.postMessage,
    });
    runtime.onRequest({ id: 'initial-lock', type: 'setAllowed', allowed: false });
    runtime.onRequest({ id: 'unlock', type: 'setAllowed', allowed: true });
    runtime.onRequest({
      id: 'active',
      type: 'execute',
      operation: 'clearCredentials',
      request: {},
    });
    runtime.onRequest({ id: 'queued', type: 'execute', operation: 'hasKey', request: {} });
    ready.resolve(wasm);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(transitions).toEqual([0, 1]);
    expect(inbox.responses).toContainEqual({ id: 'active', ok: true, result: {} });
    expect(inbox.responses).toContainEqual({ id: 'queued', ok: true, result: {} });
  });

  it('awaits async ccall before reading the result pointer', async () => {
    const gate = deferred<void>();
    const wasm = createMockWasm({
      execute: () =>
        gate.promise.then(() =>
          (wasm as WasmModule & { __alloc: (j: string) => number }).__alloc('{"ok":true}'),
        ),
    });
    const inbox = collectResponses(() => undefined);
    const runtime = createKeyCryptoWorkerRuntime({
      getModule: async () => wasm,
      postMessage: inbox.postMessage,
    });
    runtime.onRequest({ id: 'slow', type: 'execute', operation: 'op', request: {} });
    expect(inbox.responses).toHaveLength(0);
    gate.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(inbox.responses).toEqual([{ id: 'slow', ok: true, result: { ok: true } }]);
  });

  it('serializes concurrent execute requests', async () => {
    let active = 0;
    let maxActive = 0;
    const wasm = createMockWasm({
      execute: () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        const pointer = (wasm as WasmModule & { __alloc: (j: string) => number }).__alloc('{}');
        active -= 1;
        return pointer;
      },
    });
    const inbox = collectResponses(() => undefined);
    const runtime = createKeyCryptoWorkerRuntime({
      getModule: async () => wasm,
      postMessage: inbox.postMessage,
    });
    runtime.onRequest({ id: 'a', type: 'execute', operation: 'op', request: {} });
    runtime.onRequest({ id: 'b', type: 'execute', operation: 'op', request: {} });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(maxActive).toBe(1);
    expect(inbox.responses.map(r => r.id)).toEqual(['a', 'b']);
  });

  it('recovers after a failed execute', async () => {
    let calls = 0;
    const wasm = createMockWasm({
      execute: () => {
        calls += 1;
        if (calls === 1) throw new Error('FFB_ROW_INTEGRITY');
        return (wasm as WasmModule & { __alloc: (j: string) => number }).__alloc('{"after":1}');
      },
    });
    const inbox = collectResponses(() => undefined);
    const runtime = createKeyCryptoWorkerRuntime({
      getModule: async () => wasm,
      postMessage: inbox.postMessage,
    });
    runtime.onRequest({ id: 'bad', type: 'execute', operation: 'op', request: {} });
    runtime.onRequest({ id: 'good', type: 'execute', operation: 'op', request: {} });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(inbox.responses).toEqual([
      { id: 'bad', ok: false, error: 'FFB_ROW_INTEGRITY' },
      { id: 'good', ok: true, result: { after: 1 } },
    ]);
  });

  it('handles setAllowed while vault I/O is suspended and rejects queued work', async () => {
    const gate = deferred<void>();
    const wasm = createMockWasm({
      execute: (_op, _req) =>
        gate.promise.then(() =>
          (wasm as WasmModule & { __alloc: (j: string) => number }).__alloc('{}'),
        ),
      setAllowed: () => undefined,
    });
    const inbox = collectResponses(() => undefined);
    const runtime = createKeyCryptoWorkerRuntime({
      getModule: async () => wasm,
      postMessage: inbox.postMessage,
    });
    runtime.onRequest({ id: 'inflight', type: 'execute', operation: 'op', request: {} });
    runtime.onRequest({ id: 'queued', type: 'execute', operation: 'op', request: {} });
    runtime.onRequest({ id: 'lock', type: 'setAllowed', allowed: false });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(inbox.responses).toContainEqual({ id: 'lock', ok: true });
    expect(inbox.responses).toContainEqual({ id: 'queued', ok: false, error: 'FFB_KEY_LOCKED' });
    gate.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(inbox.responses.filter(r => r.id === 'inflight')).toHaveLength(1);
  });
});
