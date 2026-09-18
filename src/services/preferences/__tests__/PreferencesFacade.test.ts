import { WorkplaceId } from '@/src/types/ids';
import { createPreferencesFacade } from '../PreferencesFacade';
import { PreferencesStore } from '../PreferencesStore';
import { PREFERENCES_KEY, USER_PREFERENCES_KEY } from '../types';

const mockMemory = new Map<string, string>();

jest.mock('@/src/utils/storage', () => ({
  storage: {
    set: jest.fn((key: string, value: string) => mockMemory.set(key, value)),
    getString: jest.fn((key: string) => mockMemory.get(key)),
    remove: jest.fn((key: string) => mockMemory.delete(key)),
    getAllKeys: jest.fn(() => [...mockMemory.keys()]),
  },
  migrateFromAsyncStorage: jest.fn(async () => {
    mockMemory.set(
      'full_frills_balance_ui_preferences',
      JSON.stringify({
        activeWorkplaceId: 'wp-legacy',
        onboardingCompleted: true,
        isAppLockEnabled: true,
        isSmsImportEnabled: true,
        anonymizedId: 'device-id',
      }),
    );
    return true;
  }),
}));

describe('PreferencesFacade import restore', () => {
  beforeEach(() => {
    mockMemory.clear();
    jest.clearAllMocks();
  });

  it('preserves the entered name when a first-run backup omits it', () => {
    const preferences = createPreferencesFacade();
    preferences.setUserName('Sahil');

    preferences.restoreImportedPreferences({ theme: 'dark' }, 'workplace-1' as WorkplaceId, 'all');

    expect(preferences.userName).toBe('Sahil');
  });

  it('restores the user name from a backup during onboarding import', () => {
    const preferences = createPreferencesFacade();

    preferences.restoreImportedPreferences(
      { userName: 'Imported User', theme: 'dark' },
      'workplace-1' as WorkplaceId,
      'all',
    );

    expect(preferences.userName).toBe('Imported User');
  });

  it('uses store methods without replacing them on the instance', () => {
    const preferences = createPreferencesFacade();

    expect(preferences).toBeInstanceOf(PreferencesStore);
    expect(Object.prototype.hasOwnProperty.call(preferences, 'loadPreferences')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(preferences, 'clearPreferences')).toBe(false);
  });

  it('writes only the canonical user preference key', () => {
    const preferences = createPreferencesFacade();
    preferences.setUserName('Sahil');

    expect(mockMemory.has(USER_PREFERENCES_KEY)).toBe(true);
    expect(mockMemory.has(PREFERENCES_KEY)).toBe(false);
  });

  it('bridges legacy storage before splitting and preserves Device values', async () => {
    const preferences = createPreferencesFacade();

    await preferences.loadPreferences();

    expect(preferences.rawDeviceBagPresentAtStartup).toBe(false);
    expect(preferences.device.deviceRegistered).toBe(true);
    expect(preferences.device.isAppLockEnabled).toBe(true);
    expect(preferences.device.isSmsImportEnabled).toBe(true);
    expect(preferences.device.anonymizedId).toBe('device-id');
  });

  it('clears user-scoped privacy acknowledgement with the user bag', () => {
    const preferences = createPreferencesFacade();
    preferences.privacy.setPrivacyPolicyAcknowledgement({
      version: '2026-09-17',
      acknowledgedAt: '2026-09-17T12:34:56.000Z',
    });

    preferences.clearPreferences();

    expect(preferences.privacy.privacyPolicyAcknowledgement).toBeUndefined();
  });

  it('does not import privacy acknowledgement from backup data', () => {
    const preferences = createPreferencesFacade();

    preferences.restoreImportedPreferences(
      {
        privacyPolicyAcknowledgement: {
          version: '2026-09-17',
          acknowledgedAt: '2026-09-17T12:34:56.000Z',
        },
      },
      'workplace-1' as WorkplaceId,
      'all',
    );

    expect(preferences.privacy.privacyPolicyAcknowledgement).toBeUndefined();
  });
});
