import { exportService } from '@/src/services/export';
import { preImportBackupService } from '@/src/services/import/preImportBackupService';
import { WorkplaceId } from '@/src/types/ids';
import { files } from '@/src/utils/files';

jest.mock('@/src/services/export', () => ({
  exportService: {
    exportToJSON: jest.fn(),
  },
}));

jest.mock('@/src/utils/files', () => ({
  files: {
    document: 'file:///mock-documents/',
    ensureDirectory: jest.fn().mockResolvedValue(undefined),
    writeContent: jest.fn().mockResolvedValue('file:///mock-documents/pre-import-backups/out.zip'),
  },
}));

const mockFetchCount = jest.fn();

jest.mock('@/src/data/database/Database', () => ({
  database: {
    collections: {
      get: jest.fn(() => ({
        query: jest.fn(() => ({
          fetchCount: mockFetchCount,
        })),
      })),
    },
  },
}));

describe('PreImportBackupService', () => {
  const workplaceId = 'workplace-abc' as WorkplaceId;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchCount.mockReset();
  });

  it('skips backup when workplace has no accounts or journals', async () => {
    mockFetchCount.mockResolvedValue(0);

    const result = await preImportBackupService.createBackup(workplaceId);

    expect(result).toEqual({ skipped: true, reason: 'empty_workplace' });
    expect(exportService.exportToJSON).not.toHaveBeenCalled();
    expect(files.writeContent).not.toHaveBeenCalled();
  });

  it('exports and writes a timestamped zip when workplace has data', async () => {
    mockFetchCount.mockResolvedValueOnce(2).mockResolvedValueOnce(0);
    (exportService.exportToJSON as jest.Mock).mockResolvedValue('base64zip');

    const result = await preImportBackupService.createBackup(workplaceId);

    expect(exportService.exportToJSON).toHaveBeenCalledWith(workplaceId, expect.any(Function));
    expect(files.ensureDirectory).toHaveBeenCalledWith('file:///mock-documents/pre-import-backups');
    expect(files.writeContent).toHaveBeenCalledWith(
      expect.stringMatching(
        /file:\/\/\/mock-documents\/pre-import-backups\/pre-import-workplace-abc-.+\.zip$/,
      ),
      'base64zip',
      'base64',
    );
    expect(result).toEqual({
      path: expect.stringMatching(
        /file:\/\/\/mock-documents\/pre-import-backups\/pre-import-workplace-abc-.+\.zip$/,
      ),
    });
  });

  it('propagates write failures', async () => {
    mockFetchCount.mockResolvedValueOnce(1);
    (exportService.exportToJSON as jest.Mock).mockResolvedValue('base64zip');
    (files.writeContent as jest.Mock).mockRejectedValue(new Error('write failed'));

    await expect(preImportBackupService.createBackup(workplaceId)).rejects.toThrow('write failed');
  });
});
