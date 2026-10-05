import {
  databaseRepository,
  reactiveCacheCoordinator,
  resetIntegrityMaintenanceTestState,
  snapshotService,
  widgetProjectionService,
} from './integrityMaintenanceMocks';
import { resetDatabase, resetWorkplace } from '../integrityMaintenance';

describe('integrity maintenance projection cleanup', () => {
  beforeEach(() => {
    resetIntegrityMaintenanceTestState();
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
