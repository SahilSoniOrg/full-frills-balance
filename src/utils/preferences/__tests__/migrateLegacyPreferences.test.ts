import { storage } from '@/src/utils/storage';
import { migrateLegacyPreferencesIfNeeded } from '../migrateLegacyPreferences';

const mockMemory = new Map<string, string>();

jest.mock('@/src/utils/storage', () => ({
  storage: {
    set: jest.fn((key: string, value: string) => mockMemory.set(key, value)),
    getString: jest.fn((key: string) => mockMemory.get(key)),
    getAllKeys: jest.fn(() => [...mockMemory.keys()]),
  },
}));

describe('legacy preference migration', () => {
  beforeEach(() => {
    mockMemory.clear();
    jest.clearAllMocks();
  });

  it('resumes workplace migration after a partial write', () => {
    mockMemory.set(
      'full_frills_balance_ui_preferences',
      JSON.stringify({ activeWorkplaceId: 'wp-1', safeToSpendDays: 60 }),
    );
    const set = storage.set as jest.Mock;
    set.mockImplementationOnce((key: string, value: string) => mockMemory.set(key, value));
    set.mockImplementationOnce(() => {
      throw new Error('interrupted');
    });

    migrateLegacyPreferencesIfNeeded();
    expect(mockMemory.has('full_frills_balance_workplace_prefs:wp-1')).toBe(false);

    set.mockImplementation((key: string, value: string) => mockMemory.set(key, value));
    migrateLegacyPreferencesIfNeeded();

    expect(mockMemory.get('full_frills_balance_workplace_prefs:wp-1')).toContain('safeToSpendDays');
  });
});
