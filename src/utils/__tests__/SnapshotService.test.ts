import { snapshotService } from '../SnapshotService';
import { storage } from '@/src/utils/storage';

const mockSnapshotStore = new Map<string, unknown>();

jest.mock('@/src/utils/storage', () => ({
  storage: {
    set: jest.fn((key: string, value: unknown) => mockSnapshotStore.set(key, value)),
    getString: jest.fn((key: string) => mockSnapshotStore.get(key) as string | undefined),
    getBoolean: jest.fn((key: string) => mockSnapshotStore.get(key) as boolean | undefined),
    remove: jest.fn((key: string) => mockSnapshotStore.delete(key)),
    getAllKeys: jest.fn(() => Array.from(mockSnapshotStore.keys())),
  },
}));

describe('SnapshotService', () => {
  beforeEach(() => {
    mockSnapshotStore.clear();
    jest.clearAllMocks();
    snapshotService.clearSnapshots();
    snapshotService.resumeSnapshotsForWorkplace('workplace-1');
    snapshotService.resumeSnapshotsForWorkplace('workplace-2');
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

  it('blocks stale snapshot emissions until a published workplace resumes writes', () => {
    snapshotService.clearSnapshots();
    snapshotService.saveCustomSnapshot('workplace-1', 'safe_to_spend', { stale: true });
    expect(mockSnapshotStore.has('safe_to_spend_workplace-1')).toBe(false);

    snapshotService.resumeSnapshotsForWorkplace('workplace-1');
    snapshotService.saveCustomSnapshot('workplace-1', 'safe_to_spend', { current: true });
    expect(mockSnapshotStore.has('safe_to_spend_workplace-1')).toBe(true);
  });

  it('clears the Safe to Spend projection key for one workplace', () => {
    snapshotService.saveCustomSnapshot('workplace-1', 'safe_to_spend', { value: 1 });
    snapshotService.saveCustomSnapshot('workplace-2', 'safe_to_spend', { value: 2 });
    snapshotService.clearSnapshotsForWorkplace('workplace-1');
    expect(mockSnapshotStore.has('safe_to_spend_workplace-1')).toBe(false);
    expect(mockSnapshotStore.has('safe_to_spend_workplace-2')).toBe(true);
  });

  it('retries persisted cleanup markers on startup', () => {
    mockSnapshotStore.set('snapshot_cleanup_pending_all_v1', true);
    mockSnapshotStore.set(
      'dashboard_data_snapshot_workplace-1',
      JSON.stringify({ data: {}, timestamp: 1, workplaceId: 'workplace-1' }),
    );
    expect(snapshotService.getDashboardSnapshot('workplace-1')).toBeNull();
    expect(snapshotService.retryPendingCleanup()).toBe(true);
    expect(mockSnapshotStore.has('dashboard_data_snapshot_workplace-1')).toBe(false);
    expect(mockSnapshotStore.has('snapshot_cleanup_pending_all_v1')).toBe(false);
    snapshotService.resumeSnapshotsForWorkplace('workplace-1');
    snapshotService.saveDashboardSnapshot('workplace-1', { fresh: true });
    expect(snapshotService.getDashboardSnapshot('workplace-1')).toEqual({ fresh: true });
  });

  it('keeps reset snapshots unreadable and unwritable after cleanup until domain resume', () => {
    snapshotService.clearSnapshots();
    mockSnapshotStore.set(
      'dashboard_data_snapshot_workplace-1',
      JSON.stringify({ data: { stale: true }, timestamp: Date.now(), workplaceId: 'workplace-1' }),
    );
    mockSnapshotStore.set('snapshot_cleanup_pending_all_v1', true);
    expect(snapshotService.getDashboardSnapshot('workplace-1')).toBeNull();
    expect(snapshotService.retryPendingCleanup()).toBe(true);
    snapshotService.saveDashboardSnapshot('workplace-1', { stale: false });
    expect(mockSnapshotStore.has('dashboard_data_snapshot_workplace-1')).toBe(false);
    snapshotService.resumeSnapshotsForWorkplace('workplace-1');
    snapshotService.saveDashboardSnapshot('workplace-1', { fresh: true });
    expect(snapshotService.getDashboardSnapshot('workplace-1')).toEqual({ fresh: true });
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
