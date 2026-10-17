import { Platform } from 'react-native';
import { Directory } from 'expo-file-system';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { files } from '@/src/utils/files';
import { encryptedBackupFiles } from '../encryptedBackupFiles.native';

jest.mock('expo-file-system', () => ({
  Directory: { pickDirectoryAsync: jest.fn() },
}));
jest.mock('expo-file-system/legacy', () => ({
  StorageAccessFramework: {
    requestDirectoryPermissionsAsync: jest.fn(),
    createFileAsync: jest.fn(),
  },
}));
jest.mock('@/src/utils/files', () => ({
  files: { readBytes: jest.fn(), writeContent: jest.fn() },
}));

describe('encryptedBackupFiles native export', () => {
  const file = { write: jest.fn() };
  const directory = { createFile: jest.fn(() => file) };

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    jest.mocked(Directory.pickDirectoryAsync).mockResolvedValue(directory as unknown as Directory);
    file.write.mockReturnValue(undefined);
  });

  it('writes the ZIP into a user-selected iOS folder before reporting success', async () => {
    const archive = new Uint8Array([1, 2, 3]);

    await expect(encryptedBackupFiles.exportEncryptedBackupZip(archive)).resolves.toBe(true);

    expect(directory.createFile).toHaveBeenCalledWith(
      expect.stringMatching(/^full-frills-encrypted-backup-.*\.zip$/),
      'application/zip',
    );
    expect(file.write).toHaveBeenCalledWith(archive);
  });

  it('reports cancellation instead of success when the iOS folder picker is dismissed', async () => {
    jest
      .mocked(Directory.pickDirectoryAsync)
      .mockRejectedValueOnce(new Error('File picking was cancelled by the user'));

    await expect(encryptedBackupFiles.exportEncryptedBackupZip(new Uint8Array([1]))).resolves.toBe(
      false,
    );
    expect(directory.createFile).not.toHaveBeenCalled();
  });

  it('uses Android folder access and reports success only after writing the ZIP', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    jest
      .mocked(FileSystemLegacy.StorageAccessFramework.requestDirectoryPermissionsAsync)
      .mockResolvedValue({
        granted: true,
        directoryUri: 'content://downloads',
      });
    jest
      .mocked(FileSystemLegacy.StorageAccessFramework.createFileAsync)
      .mockResolvedValue('content://downloads/backup.zip');
    jest.mocked(files.writeContent).mockResolvedValue('content://downloads/backup.zip');
    const archive = new Uint8Array([4, 5, 6]);

    await expect(encryptedBackupFiles.exportEncryptedBackupZip(archive)).resolves.toBe(true);

    expect(FileSystemLegacy.StorageAccessFramework.createFileAsync).toHaveBeenCalledWith(
      'content://downloads',
      expect.stringMatching(/^full-frills-encrypted-backup-.*\.zip$/),
      'application/zip',
    );
    expect(files.writeContent).toHaveBeenCalledWith('content://downloads/backup.zip', archive);
  });
});
