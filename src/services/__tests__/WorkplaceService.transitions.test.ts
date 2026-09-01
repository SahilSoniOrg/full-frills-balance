import { workplaceService } from '@/src/services/WorkplaceService';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { databaseRepository } from '@/src/data/repositories/DatabaseRepository';
import { preferences } from '@/src/services/preferences';
import { analytics } from '@/src/services/analytics';

jest.mock('@/src/data/repositories/WorkplaceRepository', () => ({
  workplaceRepository: {
    findAll: jest.fn(),
    find: jest.fn(),
    createWithStarterAccounts: jest.fn(),
  },
}));

jest.mock('@/src/data/repositories/DatabaseRepository', () => ({
  databaseRepository: { destroyWorkplace: jest.fn() },
}));

jest.mock('@/src/data/database/Database', () => ({
  database: { write: jest.fn(), batch: jest.fn() },
}));

jest.mock('@/src/data/repositories/account', () => ({
  accountWriteRepository: { prepareCreateOps: jest.fn() },
}));

jest.mock('@/src/services/analytics', () => ({
  analytics: {
    logWorkplaceDeleted: jest.fn(),
    logWorkplaceSwitched: jest.fn(),
    logWorkplaceCreated: jest.fn(),
  },
}));

jest.mock('@/src/services/preferences', () => ({
  preferences: {
    device: {
      activeWorkplaceId: undefined,
      setActiveWorkplaceId: jest.fn(),
    },
    workplace: { clear: jest.fn() },
  },
  preferencesMigration: { legacyCurrencyCode: undefined },
}));

jest.mock('@/src/utils/SnapshotService', () => ({
  snapshotService: { clearSnapshotsForWorkplace: jest.fn() },
}));

const mockWorkplaces = workplaceRepository as jest.Mocked<typeof workplaceRepository>;
const mockDatabaseRepository = databaseRepository as jest.Mocked<typeof databaseRepository>;
const { snapshotService } = jest.requireMock('@/src/utils/SnapshotService') as {
  snapshotService: { clearSnapshotsForWorkplace: jest.Mock };
};

describe('WorkplaceService transitions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (preferences.device as any).activeWorkplaceId = undefined;
  });

  it('clears the active pointer when deleting the active workplace', async () => {
    const target = { id: 'active-wp' } as any;
    mockWorkplaces.findAll.mockResolvedValue([target]);
    (preferences.device as any).activeWorkplaceId = 'active-wp';

    await workplaceService.deleteWorkplace('active-wp' as any);

    expect(mockDatabaseRepository.destroyWorkplace).toHaveBeenCalledWith(
      'active-wp',
      expect.any(Array),
    );
    expect(preferences.device.setActiveWorkplaceId).toHaveBeenCalledWith(undefined);
    expect(preferences.workplace.clear).toHaveBeenCalledWith('active-wp');
    expect(snapshotService.clearSnapshotsForWorkplace).toHaveBeenCalledWith('active-wp');
  });

  it('does not retarget the active pointer when deleting another workplace', async () => {
    mockWorkplaces.findAll.mockResolvedValue([{ id: 'other-wp' } as any]);
    (preferences.device as any).activeWorkplaceId = 'active-wp';

    await workplaceService.deleteWorkplace('other-wp' as any);

    expect(preferences.device.setActiveWorkplaceId).not.toHaveBeenCalled();
    expect(preferences.workplace.clear).toHaveBeenCalledWith('other-wp');
  });

  it('reports a committed deletion when active pointer cleanup fails', async () => {
    mockWorkplaces.findAll.mockResolvedValue([{ id: 'active-wp' } as any]);
    (preferences.device as any).activeWorkplaceId = 'active-wp';
    (preferences.device.setActiveWorkplaceId as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Storage unavailable');
    });

    await expect(workplaceService.deleteWorkplace('active-wp' as any)).resolves.toEqual({
      status: 'committed_with_warnings',
      warnings: ['Active Workplace pointer cleanup failed'],
    });
    expect(mockDatabaseRepository.destroyWorkplace).toHaveBeenCalled();
    expect(preferences.workplace.clear).toHaveBeenCalledWith('active-wp');
  });

  it('does not turn committed deletion into failure when analytics throws', async () => {
    mockWorkplaces.findAll.mockResolvedValue([{ id: 'other-wp' } as any]);
    (analytics.logWorkplaceDeleted as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Analytics unavailable');
    });

    await expect(workplaceService.deleteWorkplace('other-wp' as any)).resolves.toEqual({
      status: 'committed_with_warnings',
      warnings: ['Workplace deletion analytics failed'],
    });
    expect(preferences.workplace.clear).toHaveBeenCalledWith('other-wp');
  });

  it('validates a switch target before publishing the active pointer', async () => {
    mockWorkplaces.find.mockResolvedValue(undefined);

    await expect(workplaceService.switchWorkplace('missing-wp' as any)).rejects.toThrow(
      'Workplace not found: missing-wp',
    );
    expect(preferences.device.setActiveWorkplaceId).not.toHaveBeenCalled();
    expect(analytics.logWorkplaceSwitched).not.toHaveBeenCalled();
  });

  it('reuses a workplace published by a concurrent creation retry', async () => {
    const published = { id: 'operation-wp' } as any;
    mockWorkplaces.find.mockResolvedValueOnce(undefined).mockResolvedValueOnce(published);
    mockWorkplaces.createWithStarterAccounts.mockRejectedValueOnce(
      new Error('Workplace ID collision: operation-wp'),
    );

    await expect(
      workplaceService.createWorkplace('Personal', 'briefcase', {
        id: 'operation-wp' as any,
        currencyCode: 'USD',
      }),
    ).resolves.toBe(published);
  });
});
