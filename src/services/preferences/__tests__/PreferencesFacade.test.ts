import { WorkplaceId } from '@/src/types/ids';
import { PreferencesFacadeStore } from '../PreferencesFacade';
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
    const preferences = new PreferencesFacadeStore();
    preferences.setUserName('Sahil');

    preferences.restoreImportedPreferences({ theme: 'dark' }, 'workplace-1' as WorkplaceId, 'all');

    expect(preferences.userName).toBe('Sahil');
  });

  it('restores the user name from a backup during onboarding import', () => {
    const preferences = new PreferencesFacadeStore();

    preferences.restoreImportedPreferences(
      { userName: 'Imported User', theme: 'dark' },
      'workplace-1' as WorkplaceId,
      'all',
    );

    expect(preferences.userName).toBe('Imported User');
  });

  it('uses store methods without replacing them on the instance', () => {
    const preferences = new PreferencesFacadeStore();

    expect(preferences).toBeInstanceOf(PreferencesStore);
    expect(Object.prototype.hasOwnProperty.call(preferences, 'loadPreferences')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(preferences, 'clearPreferences')).toBe(false);
  });

  it('writes only the canonical user preference key', () => {
    const preferences = new PreferencesFacadeStore();
    preferences.setUserName('Sahil');

    expect(mockMemory.has(USER_PREFERENCES_KEY)).toBe(true);
    expect(mockMemory.has(PREFERENCES_KEY)).toBe(false);
  });

  it('keeps Reports V2 opt-in until explicitly enabled', () => {
    const preferences = new PreferencesFacadeStore();

    expect(preferences.getSnapshot().reportsV2Enabled).toBe(false);
    preferences.update({ reportsV2Enabled: true });

    expect(preferences.getSnapshot().reportsV2Enabled).toBe(true);
  });

  it('bridges legacy storage before splitting and preserves Device values', async () => {
    const preferences = new PreferencesFacadeStore();

    await preferences.loadPreferences();

    expect(preferences.rawDeviceBagPresentAtStartup).toBe(false);
    expect(preferences.device.deviceRegistered).toBe(true);
    expect(preferences.device.isAppLockEnabled).toBe(true);
    expect(preferences.device.isAutomaticSmsImportEnabled).toBe(false);
    expect(preferences.device.getSnapshot().areSmsReviewNotificationsEnabled).toBe(true);
    expect(preferences.device.getSnapshot().showSmsNotificationDetails).toBe(false);
    expect(preferences.device.anonymizedId).toBe('device-id');
  });

  it('clears user-scoped privacy acknowledgement with the user bag', () => {
    const preferences = new PreferencesFacadeStore();
    preferences.privacy.setPrivacyPolicyAcknowledgement({
      version: '2026-09-07',
      acknowledgedAt: '2026-09-07T12:34:56.000Z',
    });

    preferences.clearPreferences();

    expect(preferences.privacy.privacyPolicyAcknowledgement).toBeUndefined();
  });

  it('does not import privacy acknowledgement from backup data', () => {
    const preferences = new PreferencesFacadeStore();

    preferences.restoreImportedPreferences(
      {
        privacyPolicyAcknowledgement: {
          version: '2026-09-07',
          acknowledgedAt: '2026-09-07T12:34:56.000Z',
        },
      },
      'workplace-1' as WorkplaceId,
      'all',
    );

    expect(preferences.privacy.privacyPolicyAcknowledgement).toBeUndefined();
  });

  it('keeps SMS notification choices on the device when restoring a backup', () => {
    const preferences = new PreferencesFacadeStore();
    preferences.device.update({
      areSmsReviewNotificationsEnabled: false,
      showSmsNotificationDetails: false,
    });

    preferences.restoreImportedPreferences(
      {
        areSmsReviewNotificationsEnabled: true,
        showSmsNotificationDetails: true,
        theme: 'dark',
      },
      'workplace-1' as WorkplaceId,
      'all',
    );

    expect(preferences.device.getSnapshot()).toMatchObject({
      areSmsReviewNotificationsEnabled: false,
      showSmsNotificationDetails: false,
    });
    expect(preferences.getSnapshot().theme).toBe('dark');
    expect(preferences.getSnapshot()).not.toHaveProperty('areSmsReviewNotificationsEnabled');
    expect(preferences.getSnapshot()).not.toHaveProperty('showSmsNotificationDetails');
    expect(JSON.parse(mockMemory.get(USER_PREFERENCES_KEY)!)).not.toHaveProperty(
      'areSmsReviewNotificationsEnabled',
    );
    expect(JSON.parse(mockMemory.get(USER_PREFERENCES_KEY)!)).not.toHaveProperty(
      'showSmsNotificationDetails',
    );
  });
});
