import { enableTestCrypto } from './snapshotTestHelpers';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { encryptionSetupStore } from '../encryptionSetupStore.native';
import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as Picker from 'expo-document-picker';
import * as Legacy from 'expo-file-system/legacy';
import { nativeKeyOperations } from '../nativeKeyOperations';
import { recoveryFiles } from '../recoveryFiles.native';

const mockFiles = new Map<string, string>();
const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockStore.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockStore.set(key, value);
    }),
  },
}));
jest.mock('../nativeKeyOperations', () => ({
  nativeKeyOperations: {
    pickCredential: jest.fn(),
    exportCredential: jest.fn(),
    retainCredential: jest.fn(async () => undefined),
    releaseCredential: jest.fn(async () => undefined),
    clearCredentials: jest.fn(async () => undefined),
    writeCredential: jest.fn(),
    importCredential: jest.fn(),
  },
}));
jest.mock('react-native-quick-crypto', () => ({
  __esModule: true,
  default: {
    ...jest.requireActual('node:crypto'),
    Buffer: jest.requireActual('node:buffer').Buffer,
  },
}));
jest.mock('expo-file-system', () => {
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts
        .map(part => (typeof part === 'string' ? part : part.uri))
        .join('/')
        .replace(/\/\/+/g, '/')
        .replace('file:/', 'file:///');
    }
    get name() {
      return this.uri.split('/').pop()!;
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    get size() {
      return mockFiles.get(this.uri)?.length ?? 0;
    }
    create() {
      if (this.exists) throw new Error('exists');
      mockFiles.set(this.uri, '');
    }
    write(value: string) {
      mockFiles.set(this.uri, value);
    }
    async text() {
      if (!this.exists) throw new Error('missing');
      return mockFiles.get(this.uri)!;
    }
    delete() {
      mockFiles.delete(this.uri);
    }
    rename(name: string) {
      this.move(new File('file:///app/Documents/', name));
    }
    move(destination: File) {
      mockFiles.set(destination.uri, mockFiles.get(this.uri)!);
      mockFiles.delete(this.uri);
      this.uri = destination.uri;
    }
  }
  class Directory {
    uri: string;
    constructor(part: { uri: string }) {
      this.uri = part.uri;
    }
    list() {
      return [...mockFiles.keys()]
        .filter(uri => uri.startsWith(this.uri))
        .map(uri => new File(uri));
    }
  }
  return {
    File,
    Directory,
    Paths: {
      document: { uri: 'file:///app/Documents/' },
      cache: { uri: 'file:///app/Library/Caches/' },
    },
  };
});
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system/legacy', () => ({
  EncodingType: { UTF8: 'utf8' },
  StorageAccessFramework: {
    requestDirectoryPermissionsAsync: jest.fn(),
    createFileAsync: jest.fn(async () => 'content://chosen/secret.json'),
  },
  writeAsStringAsync: jest.fn(async () => undefined),
}));
const mockSecret = {
  format: 'full-frills-recovery-handle',
  formatVersion: 1,
  purpose: 'user-recovery',
  identityId: 'alice',
  identityKeyId: `sha256:${'01'.repeat(32)}`,
  recoveryKeyId: `sha256:${'02'.repeat(32)}`,
  handle: 'ab'.repeat(32),
};
beforeEach(() => {
  enableTestCrypto();
  jest.clearAllMocks();
  mockFiles.clear();
  mockStore.clear();
  Platform.OS = 'ios';
});

it.each(['ios', 'android'] as const)(
  'delegates secret export and selection entirely to native on %s',
  async platform => {
    Platform.OS = platform;
    jest.mocked(nativeKeyOperations.exportCredential).mockResolvedValueOnce(true);
    jest.mocked(nativeKeyOperations.pickCredential).mockResolvedValueOnce(mockSecret);
    expect(await recoveryFiles.exportSecret(mockSecret)).toBe(true);
    expect(await recoveryFiles.pickSecret()).toEqual(mockSecret);
    expect(mockFiles.size).toBe(0);
    expect(nativeKeyOperations.writeCredential).not.toHaveBeenCalled();
    expect(nativeKeyOperations.importCredential).not.toHaveBeenCalled();
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
    expect(Picker.getDocumentAsync).not.toHaveBeenCalled();
  },
);
it('propagates native picker cancellation without producing a recovery handle', async () => {
  jest.mocked(nativeKeyOperations.exportCredential).mockResolvedValueOnce(false);
  jest.mocked(nativeKeyOperations.pickCredential).mockResolvedValueOnce(null);
  expect(await recoveryFiles.exportSecret(mockSecret)).toBe(false);
  expect(await recoveryFiles.pickSecret()).toBeNull();
});
it('rejects raw credential contents returned by an invalid native bridge', async () => {
  jest
    .mocked(nativeKeyOperations.pickCredential)
    .mockResolvedValueOnce({ phrase: 'must-not-be-a-bridge-result' });
  await expect(recoveryFiles.pickSecret()).rejects.toThrow();
});
it('does not claim a cancelled Android package save succeeded', async () => {
  Platform.OS = 'android';
  jest
    .mocked(Legacy.StorageAccessFramework.requestDirectoryPermissionsAsync)
    .mockResolvedValueOnce({ granted: false });
  expect(await recoveryFiles.exportPackage({ encrypted: 'fixture' })).toBe(false);
  expect(Legacy.writeAsStringAsync).not.toHaveBeenCalled();
});
it('cleans temporary ciphertext exports after iOS sharing succeeds or fails', async () => {
  expect(await recoveryFiles.exportPackage({ encrypted: 'fixture' })).toBe(true);
  expect(mockFiles.size).toBe(0);
  jest.mocked(Sharing.shareAsync).mockRejectedValueOnce(new Error('sharing failed'));
  await expect(recoveryFiles.exportPackage({ encrypted: 'fixture' })).rejects.toThrow(
    'sharing failed',
  );
  expect(mockFiles.size).toBe(0);
});
it('clears native handles while preserving unrelated cached files', async () => {
  mockFiles.set('file:///app/Library/Caches/ordinary.json', 'keep');
  await recoveryFiles.cleanupTemporarySecrets();
  expect(nativeKeyOperations.clearCredentials).toHaveBeenCalled();
  expect([...mockFiles.keys()]).toEqual(['file:///app/Library/Caches/ordinary.json']);
});

it('prunes obsolete retained ciphertext only after committing the new session reference', async () => {
  const old = '11'.repeat(16),
    current = '22'.repeat(16);
  const prefix = 'file:///app/Documents/encrypted-recovery-';
  mockFiles.set(`${prefix}${old}.json`, 'old ciphertext');
  mockFiles.set(`${prefix}${current}.json`, 'current ciphertext');
  mockFiles.set('file:///app/Documents/ordinary.json', 'keep');
  await encryptionSetupStore.saveSession({
    formatVersion: 1,
    intent: 'create-user',
    userId: 'alice',
    deviceId: 'phone',
    package: {
      id: current,
      workplaceId: 'books',
      confirmed: true,
      fingerprint: `sha256:${'01'.repeat(32)}`,
    },
  });
  expect(mockFiles.has(`${prefix}${old}.json`)).toBe(false);
  expect(mockFiles.has(`${prefix}${current}.json`)).toBe(true);
  expect(mockFiles.has('file:///app/Documents/ordinary.json')).toBe(true);
});
it('keeps retained packages when publishing the replacement session fails', async () => {
  const name = `file:///app/Documents/encrypted-recovery-${'11'.repeat(16)}.json`;
  mockFiles.set(name, 'old ciphertext');
  jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('session unavailable'));
  await expect(
    encryptionSetupStore.saveSession({
      formatVersion: 1,
      intent: 'create-user',
      userId: 'alice',
      deviceId: 'phone',
    }),
  ).rejects.toThrow('session unavailable');
  expect(mockFiles.has(name)).toBe(true);
});

it('removes an unpublished staged package after a failed checkpoint without deleting the live one', async () => {
  const session = {
    formatVersion: 1 as const,
    intent: 'create-user' as const,
    userId: 'alice',
    deviceId: 'phone',
  };
  const payload = {
    workplaceKeys: { workplaceId: 'books' },
    encrypted: 'fixture',
  } as unknown as Parameters<typeof encryptionSetupStore.writePackage>[0];
  const first = await encryptionSetupStore.writePackage(payload);
  await encryptionSetupStore.saveSession({ ...session, package: first });
  const second = await encryptionSetupStore.writePackage(payload);
  jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('checkpoint failed'));
  await expect(encryptionSetupStore.saveSession({ ...session, package: second })).rejects.toThrow(
    'checkpoint failed',
  );
  expect([...mockFiles.keys()]).toEqual([
    `file:///app/Documents/encrypted-recovery-${first.id}.json`,
  ]);
});
