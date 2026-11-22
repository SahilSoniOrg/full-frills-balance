import { StorageAccessFramework } from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { ShareFormat, type Shareable } from '@/src/types/sharing';
import { PlatformShareTransport } from '../ShareTransport';
import { SharingRuntime } from '../SharingRuntime';

const mockOpen = jest.fn();
const mockDelete = jest.fn();

jest.mock('expo-file-system', () => ({
  FileMode: { ReadOnly: 'r', WriteOnly: 'w' },
  File: class {
    constructor(private readonly uri: string) {}

    open(mode: string) {
      return mockOpen(this.uri, mode);
    }

    delete() {
      mockDelete(this.uri);
    }
  },
}));
jest.mock('expo-file-system/legacy', () => ({
  StorageAccessFramework: {
    requestDirectoryPermissionsAsync: jest.fn(),
    createFileAsync: jest.fn(),
  },
}));
jest.mock('@/src/services/feedback/alerts', () => ({
  confirm: { show: ({ onCancel }: { onCancel: () => void }) => onCancel() },
}));
jest.mock('@/src/services/files/files', () => ({ files: {} }));
jest.mock('@/src/services/analytics', () => ({ analytics: { track: jest.fn() } }));

const sourceUri = 'file:///cache/export.csv';
const destinationUri = 'content://destination/export.csv';
const source: Shareable = {
  id: 'export',
  title: 'Transactions',
  filename: 'transactions',
  supportedFormats: [ShareFormat.CSV],
  scope: { kind: 'device' },
  prepare: async () => ({ kind: 'file', uri: sourceUri }),
};

it.each(['success', 'cancelled', 'failed'] as const)(
  'closes both Android file handles after a %s copy',
  async result => {
    const platform = jest.replaceProperty(Platform, 'OS', 'android');
    try {
      const controller = new AbortController();
      const input = {
        readBytes: jest
          .fn()
          .mockResolvedValueOnce(new Uint8Array([1, 2]))
          .mockResolvedValueOnce(new Uint8Array([3, 4]))
          .mockResolvedValueOnce(new Uint8Array()),
        close: jest.fn(),
      };
      const output = {
        writeBytes: jest.fn(async () => {
          if (result === 'failed') throw new Error('Write failed');
          if (result === 'cancelled') controller.abort();
        }),
        close: jest.fn(),
      };
      mockOpen.mockReset().mockReturnValueOnce(input).mockReturnValueOnce(output);
      mockDelete.mockClear();
      jest.mocked(StorageAccessFramework.requestDirectoryPermissionsAsync).mockResolvedValue({
        granted: true,
        directoryUri: 'content://destination',
      });
      jest.mocked(StorageAccessFramework.createFileAsync).mockResolvedValue(destinationUri);

      const runtime = new SharingRuntime(new PlatformShareTransport());
      const outcome = await runtime.execute(
        source,
        { action: 'save', format: ShareFormat.CSV },
        controller.signal,
      );

      expect(outcome.kind).toBe(result === 'success' ? 'saved' : result);
      expect(mockOpen.mock.calls).toEqual([
        [sourceUri, 'r'],
        [destinationUri, 'w'],
      ]);
      expect(input.close).toHaveBeenCalledTimes(1);
      expect(output.close).toHaveBeenCalledTimes(1);
      if (result === 'success') {
        expect(output.writeBytes.mock.calls).toEqual([
          [new Uint8Array([1, 2])],
          [new Uint8Array([3, 4])],
        ]);
        expect(mockDelete).not.toHaveBeenCalled();
      } else {
        expect(mockDelete).toHaveBeenCalledWith(destinationUri);
      }
    } finally {
      platform.restore();
    }
  },
);
