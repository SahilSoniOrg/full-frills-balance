import { WorkplaceId } from '@/src/types/ids';
import { WorkplacePreferencesStore } from '../WorkplacePreferencesStore';
import { storage } from '@/src/utils/storage';

const mockMemory = new Map<string, string>();

jest.mock('@/src/utils/storage', () => ({
  storage: {
    set: jest.fn((key: string, value: string) => mockMemory.set(key, value)),
    getString: jest.fn((key: string) => mockMemory.get(key)),
    remove: jest.fn((key: string) => mockMemory.delete(key)),
    getAllKeys: jest.fn(() => Array.from(mockMemory.keys())),
  },
}));

describe('WorkplacePreferencesStore', () => {
  beforeEach(() => {
    mockMemory.clear();
    jest.clearAllMocks();
  });

  it('isolates STS days across workplaces', () => {
    const store = new WorkplacePreferencesStore();
    const one = 'wp-1' as WorkplaceId;
    const two = 'wp-2' as WorkplaceId;

    store.update(one, { safeToSpendDays: 60 });
    store.update(two, { safeToSpendDays: 90 });

    expect(store.getSnapshot(one).safeToSpendDays).toBe(60);
    expect(store.getSnapshot(two).safeToSpendDays).toBe(90);
    expect(storage.set).toHaveBeenCalled();
  });

  it('does not publish an in-memory value when persistence fails', () => {
    const store = new WorkplacePreferencesStore();
    const workplaceId = 'wp-1' as WorkplaceId;
    (storage.set as jest.Mock).mockImplementationOnce(() => {
      throw new Error('disk full');
    });

    expect(() => store.update(workplaceId, { safeToSpendDays: 60 })).toThrow('disk full');
    expect(store.getSnapshot(workplaceId).safeToSpendDays).not.toBe(60);
  });

  it('normalizes malformed persisted arrays and scalar values', () => {
    const workplaceId = 'wp-1' as WorkplaceId;
    mockMemory.set(
      'full_frills_balance_workplace_prefs:wp-1',
      JSON.stringify({ dismissedPatternIds: null, safeToSpendDays: null }),
    );

    const store = new WorkplacePreferencesStore();

    expect(store.getSnapshot(workplaceId).dismissedPatternIds).toEqual([]);
    expect(store.getSnapshot(workplaceId).safeToSpendDays).toBeGreaterThan(0);
  });
});
