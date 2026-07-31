import { snapshotService } from '../SnapshotService';

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
  beforeEach(() => mockSnapshotStore.clear());

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
});
