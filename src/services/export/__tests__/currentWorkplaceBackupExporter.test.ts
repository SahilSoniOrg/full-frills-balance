import { database } from '@/src/data/database/Database';
import { sharingService } from '@/src/services/SharingService';
import { preferences } from '@/src/services/preferences';
import { exportToJSON } from '../nativeBackupExporter';
import { exportCurrentWorkplaceBackup } from '../currentWorkplaceBackupExporter';

jest.mock('@/src/data/database/Database', () => ({
  database: { collections: { get: jest.fn() } },
}));

jest.mock('@/src/services/SharingService', () => ({
  sharingService: { save: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('@/src/services/preferences', () => ({
  preferences: {
    loadPreferences: jest.fn().mockResolvedValue(undefined),
    device: { activeWorkplaceId: undefined },
  },
}));

jest.mock('../nativeBackupExporter', () => ({
  exportToJSON: jest.fn().mockResolvedValue('base64-backup'),
}));

describe('exportCurrentWorkplaceBackup', () => {
  const getCollection = database.collections.get as jest.Mock;
  const activeWorkplace = { id: 'active-workplace' };
  const fallbackWorkplace = { id: 'fallback-workplace' };

  beforeEach(() => {
    jest.clearAllMocks();
    (preferences.device as { activeWorkplaceId?: string }).activeWorkplaceId = activeWorkplace.id;
  });

  it('exports the active workplace and saves the ZIP', async () => {
    getCollection.mockReturnValue({
      query: () => ({ fetch: jest.fn().mockResolvedValue([fallbackWorkplace, activeWorkplace]) }),
    });
    const onProgress = jest.fn();

    await exportCurrentWorkplaceBackup(onProgress);

    expect(exportToJSON).toHaveBeenCalledWith(activeWorkplace.id, onProgress);
    expect(sharingService.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'mandatory-update-backup',
        mimeType: 'application/zip',
        fileExtension: 'zip',
        getContent: expect.any(Function),
      }),
      'ZIP',
      onProgress,
    );
    const saveMock = sharingService.save as jest.Mock;
    expect(saveMock.mock.calls[0][0].getContent()).toBe('base64-backup');
  });

  it('falls back to the first workplace when no active workplace is set', async () => {
    (preferences.device as { activeWorkplaceId?: string }).activeWorkplaceId = undefined;
    getCollection.mockReturnValue({
      query: () => ({ fetch: jest.fn().mockResolvedValue([fallbackWorkplace, activeWorkplace]) }),
    });

    await exportCurrentWorkplaceBackup();

    expect(exportToJSON).toHaveBeenCalledWith(fallbackWorkplace.id, undefined);
  });

  it('fails clearly when there are no workplaces to export', async () => {
    getCollection.mockReturnValue({ query: () => ({ fetch: jest.fn().mockResolvedValue([]) }) });

    await expect(exportCurrentWorkplaceBackup()).rejects.toThrow('No workplace is available');
    expect(exportToJSON).not.toHaveBeenCalled();
    expect(sharingService.save).not.toHaveBeenCalled();
  });
});
