import { storage } from '@/src/utils/storage';
import {
  isPreferenceSplitMigrationComplete,
  migrateLegacyPreferencesIfNeeded,
} from '../migrateLegacyPreferences';

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

  it('maps legacy onboarding completion to the new device claim flag', () => {
    mockMemory.set(
      'full_frills_balance_ui_preferences',
      JSON.stringify({
        onboardingCompleted: true,
        activeWorkplaceId: 'wp-1',
        userName: 'Sahil',
        safeToSpendDays: 60,
      }),
    );

    expect(migrateLegacyPreferencesIfNeeded()).toBe(true);

    const device = JSON.parse(mockMemory.get('full_frills_balance_device_preferences') as string);
    const user = JSON.parse(mockMemory.get('full_frills_balance_user_preferences') as string);
    const workplace = JSON.parse(
      mockMemory.get('full_frills_balance_workplace_prefs:wp-1') as string,
    );

    expect(device).toMatchObject({
      deviceRegistered: true,
      activeWorkplaceId: 'wp-1',
    });
    expect(device).not.toHaveProperty('onboardingCompleted');
    expect(user.userName).toBe('Sahil');
    expect(workplace.safeToSpendDays).toBe(60);
    expect(isPreferenceSplitMigrationComplete()).toBe(true);
  });

  it('keeps an explicit new-format device claim flag authoritative', () => {
    mockMemory.set(
      'full_frills_balance_ui_preferences',
      JSON.stringify({ onboardingCompleted: true, deviceRegistered: false }),
    );

    expect(migrateLegacyPreferencesIfNeeded()).toBe(true);

    const device = JSON.parse(mockMemory.get('full_frills_balance_device_preferences') as string);
    expect(device.deviceRegistered).toBe(false);
  });

  it('retains the legacy global currency for workplace migration', () => {
    mockMemory.set(
      'full_frills_balance_ui_preferences',
      JSON.stringify({ defaultCurrencyCode: 'INR', userName: 'Sahil' }),
    );

    expect(migrateLegacyPreferencesIfNeeded()).toBe(true);

    const user = JSON.parse(mockMemory.get('full_frills_balance_user_preferences') as string);
    const canonical = JSON.parse(mockMemory.get('full_frills_balance_ui_preferences') as string);
    expect(user).toMatchObject({ userName: 'Sahil', defaultCurrencyCode: 'INR' });
    expect(canonical).not.toHaveProperty('defaultCurrencyCode');
  });

  it('recovers legacy currency when a prior split attempt already wrote User', () => {
    mockMemory.set(
      'full_frills_balance_ui_preferences',
      JSON.stringify({ defaultCurrencyCode: 'INR', userName: 'Sahil' }),
    );
    mockMemory.set('full_frills_balance_user_preferences', JSON.stringify({ userName: 'Sahil' }));

    expect(migrateLegacyPreferencesIfNeeded()).toBe(true);

    const user = JSON.parse(mockMemory.get('full_frills_balance_user_preferences') as string);
    expect(user).toMatchObject({ userName: 'Sahil', defaultCurrencyCode: 'INR' });
  });
});
