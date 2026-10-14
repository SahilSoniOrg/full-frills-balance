import AsyncStorage from '@react-native-async-storage/async-storage';
import { keyCiphertextStateStore } from '../keyCiphertextStateStore.native';
import { enableTestCrypto } from './snapshotTestHelpers';

const mockFiles = new Map<string, string>(),
  mockPointers = new Map<string, string>();
let mockRenameFails = false;
jest.mock('react-native-quick-crypto', () => ({
  __esModule: true,
  default: {
    ...jest.requireActual('node:crypto'),
    Buffer: jest.requireActual('node:buffer').Buffer,
  },
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async key => mockPointers.get(key) ?? null),
    setItem: jest.fn(async (key, value) => {
      mockPointers.set(key, value);
    }),
    removeItem: jest.fn(async key => {
      mockPointers.delete(key);
    }),
  },
}));
jest.mock('expo-file-system', () => ({
  Paths: { document: 'documents' },
  File: class {
    path: string;
    constructor(...parts: string[]) {
      this.path = parts.join('/');
    }
    get exists() {
      return mockFiles.has(this.path);
    }
    get size() {
      return mockFiles.get(this.path)?.length ?? 0;
    }
    create() {
      if (this.exists) throw new Error('exists');
      mockFiles.set(this.path, '');
    }
    write(value: string) {
      mockFiles.set(this.path, value);
    }
    async text() {
      if (!this.exists) throw new Error('missing');
      return mockFiles.get(this.path)!;
    }
    rename(name: string) {
      if (mockRenameFails) throw new Error('rename interrupted');
      const destination = `documents/${name}`;
      if (mockFiles.has(destination)) throw new Error('immutable file collision');
      mockFiles.set(destination, mockFiles.get(this.path)!);
      mockFiles.delete(this.path);
      this.path = destination;
    }
    delete() {
      mockFiles.delete(this.path);
    }
  },
}));
beforeEach(() => {
  jest.clearAllMocks();
  enableTestCrypto();
  mockFiles.clear();
  mockPointers.clear();
  mockRenameFails = false;
});
it('publishes complete immutable ciphertext before a small pointer and isolates scopes', async () => {
  await keyCiphertextStateStore.write('alice-phone', {
    envelope: 'ciphertext',
    publicKey: 'public',
  });
  expect(await keyCiphertextStateStore.read('alice-phone')).toEqual({
    envelope: 'ciphertext',
    publicKey: 'public',
  });
  expect(await keyCiphertextStateStore.read('bob-phone')).toBeNull();
  expect(Object.keys(JSON.parse([...mockPointers.values()][0])).sort()).toEqual(['hash', 'name']);
  expect([...mockFiles.keys()][0]).not.toContain('.tmp');
});
it('retains the prior state across rename and pointer failures, then permits retry', async () => {
  await keyCiphertextStateStore.write('alice', { phase: 'staged' });
  mockRenameFails = true;
  await expect(keyCiphertextStateStore.write('alice', { phase: 'ready' })).rejects.toThrow(
    'rename',
  );
  expect(await keyCiphertextStateStore.read('alice')).toEqual({ phase: 'staged' });
  mockRenameFails = false;
  jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('pointer interrupted'));
  await expect(keyCiphertextStateStore.write('alice', { phase: 'ready' })).rejects.toThrow(
    'pointer',
  );
  expect(await keyCiphertextStateStore.read('alice')).toEqual({ phase: 'staged' });
  await keyCiphertextStateStore.write('alice', { phase: 'ready' });
  expect(await keyCiphertextStateStore.read('alice')).toEqual({ phase: 'ready' });
});
it('fails on missing/tampered files instead of regenerating state, and removes the live reference', async () => {
  await keyCiphertextStateStore.write('alice', { envelope: 'ciphertext' });
  const name = [...mockFiles.keys()][0];
  const content = mockFiles.get(name)!;
  mockFiles.set(name, content + ' ');
  await expect(keyCiphertextStateStore.read('alice')).rejects.toThrow('integrity');
  mockFiles.delete(name);
  await expect(keyCiphertextStateStore.read('alice')).rejects.toThrow('Missing');
  await keyCiphertextStateStore.remove('alice');
  expect(await keyCiphertextStateStore.read('alice')).toBeNull();
});
