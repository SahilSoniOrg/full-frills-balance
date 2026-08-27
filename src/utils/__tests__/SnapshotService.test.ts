import { snapshotService } from '../SnapshotService';
import { storage } from '@/src/utils/storage';

const mockSnapshotStore = new Map<string, unknown>();

jest.mock('@/src/utils/storage', () => ({
  storage: {
    set: jest.fn((key: string, value: unknown) => mockSnapshotStore.set(key, value)),
    getString: jest.fn((key: string) => mockSnapshotStore.get(key) as string | undefined),
    remove: jest.fn((key: string) => mockSnapshotStore.delete(key)),
    getAllKeys: jest.fn(() => Array.from(mockSnapshotStore.keys())),
  },
}));

describe('SnapshotService', () => {
  beforeEach(() => {
    mockSnapshotStore.clear();
    jest.clearAllMocks();
    snapshotService.clearSnapshots();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('skips redundant writes while persisting changed data immediately', () => {
    snapshotService.saveCustomSnapshot('workplace-1', 'accounts', { value: 1 });
    snapshotService.saveCustomSnapshot('workplace-1', 'accounts', { value: 1 });
    snapshotService.saveCustomSnapshot('workplace-1', 'accounts', { value: 2 });

    expect(storage.set).toHaveBeenCalledTimes(2);
    expect(snapshotService.getCustomSnapshot('workplace-1', 'accounts')).toEqual({ value: 2 });
  });

  it('round-trips typed payloads containing maps and sets', () => {
    snapshotService.saveCustomSnapshot('workplace-1', 'typed', {
      accounts: new Map([['cash', 100]]),
      selected: new Set(['cash']),
    });

    const snapshot = mockSnapshotStore.get('typed_workplace-1');
    expect(typeof snapshot).toBe('string');
    const restored = snapshotService.getCustomSnapshot<{
      accounts: Map<string, number>;
      selected: Set<string>;
    }>('workplace-1', 'typed');

    expect(restored?.accounts).toEqual(new Map([['cash', 100]]));
    expect(restored?.selected).toEqual(new Set(['cash']));
  });

  it('rejects snapshots from another workplace', () => {
    snapshotService.saveCustomSnapshot('workplace-1', 'isolated', { value: 1 });

    expect(snapshotService.getCustomSnapshot('workplace-2', 'isolated')).toBeNull();
    expect(mockSnapshotStore.has('isolated_workplace-1')).toBe(true);
  });

  it('expires snapshots older than two days', () => {
    const oldSnapshot = JSON.stringify({
      data: { value: 1 },
      timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000,
      workplaceId: 'workplace-1',
    });
    mockSnapshotStore.set('expired_workplace-1', oldSnapshot);

    expect(snapshotService.getCustomSnapshot('workplace-1', 'expired')).toBeNull();
    expect(mockSnapshotStore.has('expired_workplace-1')).toBe(false);
  });

  it('coalesces deferred writes per workplace and snapshot key', () => {
    jest.useFakeTimers();
    snapshotService.deferCustomSnapshot('workplace-1', 'accounts', { value: 1 });
    snapshotService.deferCustomSnapshot('workplace-1', 'accounts', { value: 2 });
    snapshotService.deferCustomSnapshot('workplace-2', 'accounts', { value: 3 });

    expect(mockSnapshotStore.size).toBe(0);
    jest.runAllTimers();

    expect(JSON.parse(mockSnapshotStore.get('accounts_workplace-1') as string).data).toEqual({
      value: 2,
    });
    expect(JSON.parse(mockSnapshotStore.get('accounts_workplace-2') as string).data).toEqual({
      value: 3,
    });
  });

  it('cancels pending writes when snapshots are cleared', () => {
    jest.useFakeTimers();
    snapshotService.deferDashboardSnapshot('workplace-1', { value: 1 });
    snapshotService.clearSnapshots();
    jest.runAllTimers();
    expect(mockSnapshotStore.has('dashboard_data_snapshot_workplace-1')).toBe(false);
  });

  it('clears all snapshot types for one workplace without touching another', () => {
    snapshotService.saveDashboardSnapshot('workplace-1', { value: 1 });
    snapshotService.saveCustomSnapshot('workplace-1', 'accounts_list_data', { value: 1 });
    snapshotService.saveCustomSnapshot('workplace-2', 'accounts_list_data', { value: 2 });

    snapshotService.clearSnapshotsForWorkplace('workplace-1');

    expect(snapshotService.getDashboardSnapshot('workplace-1')).toBeNull();
    expect(snapshotService.getCustomSnapshot('workplace-1', 'accounts_list_data')).toBeNull();
    expect(snapshotService.getCustomSnapshot('workplace-2', 'accounts_list_data')).toEqual({
      value: 2,
    });
  });
});
