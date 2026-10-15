import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { KeyOperationError, keyOperationErrorCode } from '@/src/utils/keyOperationError';
import { LocalKeyHierarchy } from '@/src/services/backup/localKeyHierarchy';
import type { KeyCiphertextStateStore } from '@/src/services/backup/keyCiphertextStateStore';
import {
  keyOperationsFromTransport,
  type NativeKeyOperations,
} from '@/src/services/backup/nativeKeyApi';

class NativeHost {
  private process: ChildProcessWithoutNullStreams;
  private pending: {
    resolve(value: unknown): void;
    reject(error: Error): void;
    devices: Map<string, string>;
  }[] = [];
  constructor() {
    if (!process.env.FFB_NATIVE_CRYPTO_HOST_BIN)
      throw new Error('Run test:native-key-crypto or verify to compile the real native core');
    this.process = spawn(process.env.FFB_NATIVE_CRYPTO_HOST_BIN, [], {
      stdio: 'pipe',
    });
    createInterface({ input: this.process.stdout }).on('line', line => {
      const result: {
        result?: unknown;
        error?: string;
        devices: Record<string, string>;
      } = JSON.parse(line);
      const waiter = this.pending.shift();
      if (!waiter) return;
      waiter.devices.clear();
      for (const [key, tag] of Object.entries(result.devices)) waiter.devices.set(key, tag);
      if (result.error)
        waiter.reject(new KeyOperationError(keyOperationErrorCode({ message: result.error })));
      else waiter.resolve(result.result);
    });
    const fail = () => {
      for (const waiter of this.pending.splice(0))
        waiter.reject(new Error('Native test host exited'));
    };
    this.process.on('error', fail);
    this.process.on('exit', fail);
    this.process.stderr.resume();
  }
  execute(
    operation: string,
    request: unknown,
    vaultId: string,
    devices: Map<string, string>,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject, devices });
      this.process.stdin.write(`${JSON.stringify({ operation, request, vaultId })}\n`);
    });
  }
  async close() {
    this.process.stdin.end();
    await new Promise<void>(resolve => this.process.once('exit', () => resolve()));
  }
}
let host: NativeHost | undefined;
let sequence = 0;
export async function closeNativeHost() {
  const current = host;
  host = undefined;
  if (current) await current.close();
}
export function memoryKeyHierarchy(assertAccess: () => void = () => undefined) {
  host ??= new NativeHost();
  const activeHost = host;
  const vaultId = String(++sequence);
  const ciphertext = new Map<string, unknown>();
  // Public one-way test tags, never private Device bytes.
  const deviceTags = new Map<string, string>();
  const copy = (value: unknown) => JSON.parse(JSON.stringify(value));
  const state: KeyCiphertextStateStore = {
    read: jest.fn(async scope => (ciphertext.has(scope) ? copy(ciphertext.get(scope)) : null)),
    write: jest.fn(async (scope, value) => {
      ciphertext.set(scope, copy(value));
    }),
    remove: jest.fn(async scope => {
      ciphertext.delete(scope);
    }),
  };
  const execute = (operation: string, request: unknown) =>
    activeHost.execute(operation, request, vaultId, deviceTags);
  const forbidden = jest.fn(async (): Promise<never> => {
    throw new Error('Use explicit native test commands for fixture files');
  });
  const crypto: NativeKeyOperations = {
    ...keyOperationsFromTransport(execute),
    pickCredential: forbidden,
    exportCredential: forbidden,
    retainCredential: forbidden,
    releaseCredential: forbidden,
    clearCredentials: async () => undefined,
  };
  jest.spyOn(crypto, 'openKey');
  return {
    state,
    ciphertext,
    deviceTags,
    crypto,
    host: { execute },
    eraseDeviceKeys: () => execute('test.clearDeviceVault', {}),
    hierarchy: new LocalKeyHierarchy(state, assertAccess, crypto),
  };
}
export async function enrolledKeyHierarchy(workplaceId = 'snapshot-workplace') {
  const context = memoryKeyHierarchy();
  const userCredential = await context.hierarchy.beginUser('alice', 'phone');
  const identity = await context.hierarchy.confirmUserRecovery('alice', 'phone', userCredential);
  const workplaceCredential = await context.hierarchy.enrollWorkplace(
    identity,
    workplaceId,
    'local-upgrade',
  );
  await context.hierarchy.confirmWorkplaceRecovery(identity, workplaceId, workplaceCredential);
  return {
    ...context,
    identity,
    userCredential,
    workplaceCredential,
    workplaceId,
  };
}

export function nativeTestOperation(operation: string, request: unknown) {
  return memoryKeyHierarchy().host.execute(operation, request);
}

if (process.env.NODE_ENV !== 'test') throw new Error('__FFB_JS_KEY_CRYPTO_TEST_ONLY__');
