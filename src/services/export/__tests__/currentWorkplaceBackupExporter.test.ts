import { sharingService } from '@/src/services/SharingService';
import { preferences } from '@/src/services/preferences';
import { ShareFormat } from '@/src/types/sharing';
import { asWorkplaceId } from '@/src/types/ids';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { exportUpdateBackup } from '../currentWorkplaceBackupExporter';

const mockExportWorkplacesToJSON = jest.fn();
const mockFindAll = workplaceRepository.findAll as jest.Mock;

jest.mock('@/src/services/SharingService', () => ({
  sharingService: { save: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('@/src/services/preferences', () => ({
  preferences: {
    loadPreferences: jest.fn().mockResolvedValue(undefined),
    device: { activeWorkplaceId: undefined },
  },
}));

jest.mock('@/src/data/repositories/WorkplaceRepository', () => ({
  workplaceRepository: { findAll: jest.fn() },
}));

jest.mock('../nativeBackupExporter', () => ({
  exportWorkplacesToJSON: (...args: unknown[]) => mockExportWorkplacesToJSON(...args),
}));

describe('exportUpdateBackup', () => {
  const home = { id: asWorkplaceId('home') };
  const work = { id: asWorkplaceId('work') };

  beforeEach(() => {
    jest.clearAllMocks();
    mockExportWorkplacesToJSON.mockResolvedValue('base64-backup');
    (preferences.device as { activeWorkplaceId?: string }).activeWorkplaceId = home.id;
    mockFindAll.mockResolvedValue([home, work]);
  });

  it('exports every workplace by default', async () => {
    await exportUpdateBackup();

    expect(mockExportWorkplacesToJSON).toHaveBeenCalledWith([home.id, work.id], 'all', undefined);
  });

  it('exports the active workplace or falls back to the first workplace', async () => {
    await exportUpdateBackup('active');
    expect(mockExportWorkplacesToJSON).toHaveBeenCalledWith([home.id], 'selected', undefined);

    (preferences.device as { activeWorkplaceId?: string }).activeWorkplaceId = undefined;
    await exportUpdateBackup('active');
    expect(mockExportWorkplacesToJSON).toHaveBeenLastCalledWith([home.id], 'selected', undefined);
  });

  it('exports exactly the selected workplaces', async () => {
    await exportUpdateBackup('selected', [work.id], jest.fn());

    expect(mockExportWorkplacesToJSON).toHaveBeenCalledWith(
      [work.id],
      'selected',
      expect.any(Function),
    );
  });

  it('persists the generated payload as the mandatory ZIP backup', async () => {
    await exportUpdateBackup('active');

    const save = sharingService.save as jest.Mock;
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'mandatory-update-backup',
        mimeType: 'application/zip',
        fileExtension: 'zip',
        getContent: expect.any(Function),
      }),
      ShareFormat.ZIP,
      undefined,
    );
    expect(save.mock.calls[0][0].getContent()).toBe('base64-backup');
  });

  it('does not save when there are no workplaces to export', async () => {
    mockFindAll.mockResolvedValue([]);
    mockExportWorkplacesToJSON.mockRejectedValueOnce(new Error('No workplaces selected to export'));

    await expect(exportUpdateBackup()).rejects.toThrow('No workplaces selected to export');
    expect(sharingService.save).not.toHaveBeenCalled();
  });
});
