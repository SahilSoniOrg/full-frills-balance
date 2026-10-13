import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as Picker from 'expo-document-picker';
import * as Legacy from 'expo-file-system/legacy';
import { nativeKeyOperations } from '../nativeKeyOperations';
import { recoveryFiles } from '../recoveryFiles.native';

const mockFiles = new Map<string, string>();
jest.mock('../nativeKeyOperations', () => ({
  nativeKeyOperations: {
    retainCredential: jest.fn(async () => undefined),
    releaseCredential: jest.fn(async () => undefined),
    clearCredentials: jest.fn(async () => undefined),
    writeCredential: jest.fn(async (_handle, uri) => {
      mockFiles.set(uri, JSON.stringify({ phrase: 'native-only-export' }));
    }),
    importCredential: jest.fn(async uri => {
      const contents = mockFiles.get(uri) ?? mockFiles.get(uri.replace('content://', 'content:/'));
      if (!contents) throw new Error('missing');
      JSON.parse(contents);
      return mockSecret;
    }),
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
  jest.clearAllMocks();
  mockFiles.clear();
  Platform.OS = 'ios';
});

it('uses only a temporary iOS export file and deletes it after both success and cancellation/error', async () => {
  let observed: string | undefined;
  jest.mocked(Sharing.shareAsync).mockImplementationOnce(async uri => {
    observed = mockFiles.get(uri);
  });
  expect(await recoveryFiles.exportSecret(mockSecret)).toBe(true);
  expect(JSON.parse(observed!)).toEqual({ phrase: 'native-only-export' });
  expect(nativeKeyOperations.writeCredential).toHaveBeenCalledWith(mockSecret, expect.any(String));
  expect(nativeKeyOperations.releaseCredential).toHaveBeenCalledWith(mockSecret);
  expect(mockFiles.size).toBe(0);
  jest.mocked(Sharing.shareAsync).mockRejectedValueOnce(new Error('dismissed'));
  await expect(recoveryFiles.exportSecret(mockSecret)).rejects.toThrow('dismissed');
  expect(mockFiles.size).toBe(0);
});
it('writes Android secrets only to the chosen external destination and handles cancelled folder selection without a copy', async () => {
  Platform.OS = 'android';
  jest
    .mocked(Legacy.StorageAccessFramework.requestDirectoryPermissionsAsync)
    .mockResolvedValueOnce({ granted: false });
  expect(await recoveryFiles.exportSecret(mockSecret)).toBe(false);
  expect(Legacy.writeAsStringAsync).not.toHaveBeenCalled();
  expect(mockFiles.size).toBe(0);
  jest
    .mocked(Legacy.StorageAccessFramework.requestDirectoryPermissionsAsync)
    .mockResolvedValueOnce({ granted: true, directoryUri: 'content://chosen' });
  expect(await recoveryFiles.exportSecret(mockSecret)).toBe(true);
  expect(nativeKeyOperations.writeCredential).toHaveBeenCalledWith(
    mockSecret,
    'content://chosen/secret.json',
  );
  expect(Legacy.writeAsStringAsync).not.toHaveBeenCalled();
  mockFiles.delete('content://chosen/secret.json');
  expect(mockFiles.size).toBe(0);
  expect(Sharing.shareAsync).not.toHaveBeenCalled();
});
it('purges only abandoned recovery cache files and preserves unrelated app files', async () => {
  mockFiles.set(
    `file:///app/Library/Caches/recovery-secret-export-${'ab'.repeat(16)}.json`,
    'secret',
  );
  mockFiles.set(
    `file:///app/Library/Caches/recovery-secret-import-${'cd'.repeat(16)}.json`,
    'secret',
  );
  mockFiles.set('file:///app/Library/Caches/ordinary.json', 'keep');
  await recoveryFiles.cleanupTemporarySecrets();
  expect([...mockFiles.keys()]).toEqual(['file:///app/Library/Caches/ordinary.json']);
});
it('reads and deletes the iOS picker temporary copy without copying or touching external saved files', async () => {
  const uri = 'file:///app/tmp/picker-Inbox/secret.json';
  mockFiles.set(uri, JSON.stringify(mockSecret));
  mockFiles.set('file:///saved/secret.json', 'external');
  jest.mocked(Picker.getDocumentAsync).mockResolvedValueOnce({
    canceled: false,
    assets: [{ uri, name: 'secret.json', size: 300, lastModified: 0 }],
  });
  expect(await recoveryFiles.pickSecret()).toEqual(mockSecret);
  expect(nativeKeyOperations.importCredential).toHaveBeenCalled();
  expect(Picker.getDocumentAsync).toHaveBeenCalledWith(
    expect.objectContaining({ copyToCacheDirectory: false }),
  );
  expect([...mockFiles.keys()]).toEqual(['file:///saved/secret.json']);
});
it('deletes an oversized/malformed iOS temporary secret copy even when import fails', async () => {
  const uri = 'file:///app/tmp/picker-Inbox/secret.json';
  mockFiles.set(uri, '{invalid');
  jest.mocked(Picker.getDocumentAsync).mockResolvedValueOnce({
    canceled: false,
    assets: [{ uri, name: 'secret.json', size: 5000, lastModified: 0 }],
  });
  await expect(recoveryFiles.pickSecret()).rejects.toThrow('too large');
  expect(mockFiles.size).toBe(0);
  mockFiles.set(uri, '{invalid');
  jest.mocked(Picker.getDocumentAsync).mockResolvedValueOnce({
    canceled: false,
    assets: [{ uri, name: 'secret.json', lastModified: 0 }],
  });
  await expect(recoveryFiles.pickSecret()).rejects.toThrow();
  expect(mockFiles.size).toBe(0);
});
it('never deletes an Android source document and does not retain a cache copy', async () => {
  Platform.OS = 'android';
  const uri = 'content://external/secret.json';
  // Mock preserves content scheme through the file constructor.
  const key = 'content:/external/secret.json';
  mockFiles.set(key, JSON.stringify(mockSecret));
  jest.mocked(Picker.getDocumentAsync).mockResolvedValueOnce({
    canceled: false,
    assets: [{ uri, name: 'secret.json', lastModified: 0 }],
  });
  expect(await recoveryFiles.pickSecret()).toEqual(mockSecret);
  expect(nativeKeyOperations.importCredential).toHaveBeenCalled();
  expect(mockFiles.get(key)).toBe(JSON.stringify(mockSecret));
});
