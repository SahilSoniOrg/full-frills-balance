import { databaseRepository } from '@/src/data/repositories/DatabaseRepository';
import { preferences } from '@/src/services/preferences';
import { reactiveCacheCoordinator } from '@/src/services/reactive/ReactiveCacheCoordinator';
import { widgetProjectionService } from '@/src/services/widgets/WidgetProjectionService';
import { snapshotService } from '@/src/utils/SnapshotService';
import { resetDatabase, resetWorkplace } from '../integrityMaintenance';

jest.mock('@/src/data/repositories/DatabaseRepository', () => ({
  databaseRepository: {
    resetDatabase: jest.fn(),
    destroyWorkplace: jest.fn(),
    purgeWorkplaceData: jest.fn(),
  },
}));
jest.mock('@/src/services/preferences', () => ({
  preferences: {
    clearPreferences: jest.fn(),
    device: { activeWorkplaceId: undefined, setActiveWorkplaceId: jest.fn() },
    workplace: { clear: jest.fn() },
  },
}));
jest.mock('@/src/services/reactive/ReactiveCacheCoordinator', () => ({
  reactiveCacheCoordinator: { clearAll: jest.fn() },
}));
jest.mock('@/src/services/widgets/WidgetProjectionService', () => ({
  widgetProjectionService: {
    clearAll: jest.fn().mockResolvedValue(undefined),
    clearWorkplace: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('@/src/utils/SnapshotService', () => ({
  snapshotService: {
    clearSnapshots: jest.fn(() => true),
    clearSnapshotsForWorkplace: jest.fn(() => true),
    resumeSnapshotsForWorkplace: jest.fn(),
  },
}));
jest.mock('@/src/utils/storage', () => ({ storage: { remove: jest.fn() } }));
jest.mock('@/src/services/audit-identity', () => ({ clearLocalAuditActorId: jest.fn() }));
jest.mock('@/src/services/import/restorePublicationClaims', () => ({
  restorePublicationClaims: { clearAll: jest.fn() },
}));

describe('integrity maintenance projection cleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (preferences.device as any).activeWorkplaceId = 'wp-a';
    (snapshotService.clearSnapshots as jest.Mock).mockReturnValue(true);
    (snapshotService.clearSnapshotsForWorkplace as jest.Mock).mockReturnValue(true);
    (widgetProjectionService.clearAll as jest.Mock).mockResolvedValue(undefined);
    (widgetProjectionService.clearWorkplace as jest.Mock).mockResolvedValue(undefined);
  });

  it('leaves projections intact when the workplace database write fails', async () => {
    (databaseRepository.destroyWorkplace as jest.Mock).mockRejectedValueOnce(
      new Error('db failed'),
    );
    await expect(resetWorkplace('wp-a' as never)).rejects.toThrow('db failed');
    expect(reactiveCacheCoordinator.clearAll).not.toHaveBeenCalled();
    expect(snapshotService.clearSnapshotsForWorkplace).not.toHaveBeenCalled();
    expect(widgetProjectionService.clearWorkplace).not.toHaveBeenCalled();
  });

  it('reports widget failure as a committed warning after workplace deletion', async () => {
    (widgetProjectionService.clearWorkplace as jest.Mock).mockRejectedValueOnce(
      new Error('native'),
    );
    await expect(resetWorkplace('wp-a' as never)).resolves.toEqual({
      status: 'committed_with_warnings',
      warnings: ['Widget cleanup'],
    });
    expect(reactiveCacheCoordinator.clearAll).toHaveBeenCalledWith('wp-a');
  });

  it('reports widget failure as a committed warning after factory reset', async () => {
    (widgetProjectionService.clearAll as jest.Mock).mockRejectedValueOnce(new Error('native'));
    await expect(resetDatabase()).resolves.toEqual({
      status: 'committed_with_warnings',
      warnings: ['Widget cleanup'],
    });
    expect(reactiveCacheCoordinator.clearAll).toHaveBeenCalledWith();
    expect(snapshotService.clearSnapshots).toHaveBeenCalled();
  });
});
