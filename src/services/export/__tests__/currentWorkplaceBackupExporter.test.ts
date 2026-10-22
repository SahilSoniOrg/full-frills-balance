import { sharingService } from '@/src/services/SharingService';
import { preferences } from '@/src/services/preferences';
import { ShareFormat } from '@/src/types/sharing';
import { asWorkplaceId } from '@/src/types/ids';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { exportUpdateBackup } from '../currentWorkplaceBackupExporter';

const mockExportWorkplacesToJSON = jest.fn();
const mockFindAll = workplaceRepository.findAll as jest.Mock;

jest.mock('@/src/services/SharingService', () => ({
  sharingService: {
    execute: jest.fn(async (source, request) => {
      const artifact = await source.prepare(request.format, {
        signal: new AbortController().signal,
        reportProgress: () => {},
      });
      return { kind: artifact ? 'saved' : 'empty' };
    }),
  },
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

    expect(mockExportWorkplacesToJSON).toHaveBeenCalledWith(
      [home.id, work.id],
      'all',
      expect.any(Function),
    );
  });

  it('exports the active workplace or falls back to the first workplace', async () => {
    await exportUpdateBackup('active');
    expect(mockExportWorkplacesToJSON).toHaveBeenCalledWith(
      [home.id],
      'selected',
      expect.any(Function),
    );

    (preferences.device as { activeWorkplaceId?: string }).activeWorkplaceId = undefined;
    await exportUpdateBackup('active');
    expect(mockExportWorkplacesToJSON).toHaveBeenLastCalledWith(
      [home.id],
      'selected',
      expect.any(Function),
    );
  });

  it('exports exactly the selected workplaces', async () => {
    await exportUpdateBackup('selected', [work.id], jest.fn());

    expect(mockExportWorkplacesToJSON).toHaveBeenCalledWith(
      [work.id],
      'selected',
      expect.any(Function),
    );
  });

  it('submits a scoped mandatory ZIP backup to the shared runtime', async () => {
    await expect(exportUpdateBackup('active')).resolves.toEqual({ kind: 'saved' });
    expect(sharingService.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'mandatory-update-backup',
        scope: { kind: 'workplaces', workplaceIds: [home.id] },
        supportedFormats: [ShareFormat.ZIP],
      }),
      expect.objectContaining({ action: 'save', format: ShareFormat.ZIP }),
    );
  });

  it('returns empty without generating a backup when there are no workplaces', async () => {
    mockFindAll.mockResolvedValue([]);
    await expect(exportUpdateBackup()).resolves.toEqual({ kind: 'empty' });
    expect(mockExportWorkplacesToJSON).not.toHaveBeenCalled();
  });
});
