import { ShareFormat } from '@/src/types/sharing';
import { FontIds, ThemeIds } from '@/src/constants/design-tokens';
import { DEFAULT_UI_PREFERENCES, USER_PREFERENCE_KEYS } from '../types';
import { splitPreferenceBags } from '../splitPreferenceBags';

describe('preference bags and defaults', () => {
  it('puts chrome on user, lock and active workplace on device, STS on workplace', () => {
    const { user, device, workplace } = splitPreferenceBags({
      userName: 'Sam',
      theme: 'dark',
      isAppLockEnabled: true,
      onboardingCompleted: true,
      activeWorkplaceId: 'wp-1',
      safeToSpendDays: 60,
      isSmsImportEnabled: true,
      areSmsReviewNotificationsEnabled: false,
      showSmsNotificationDetails: true,
      dismissedPatternIds: ['p1'],
    });

    expect(user).toEqual(expect.objectContaining({ userName: 'Sam', theme: 'dark' }));
    expect(user).not.toHaveProperty('isAppLockEnabled');
    expect(user).not.toHaveProperty('areSmsReviewNotificationsEnabled');
    expect(user).not.toHaveProperty('showSmsNotificationDetails');
    expect(device).toEqual(
      expect.objectContaining({
        isAppLockEnabled: true,
        activeWorkplaceId: 'wp-1',
        areSmsReviewNotificationsEnabled: false,
        showSmsNotificationDetails: true,
      }),
    );
    expect(device).not.toHaveProperty('isSmsImportEnabled');
    expect(device).not.toHaveProperty('onboardingCompleted');
    expect(workplace).toEqual(
      expect.objectContaining({
        safeToSpendDays: 60,
        dismissedPatternIds: ['p1'],
      }),
    );
    expect(workplace).not.toHaveProperty('isSmsImportEnabled');
    expect(workplace).not.toHaveProperty('areSmsReviewNotificationsEnabled');
    expect(workplace).not.toHaveProperty('showSmsNotificationDetails');
  });

  it.each(USER_PREFERENCE_KEYS)('DEFAULT_UI_PREFERENCES includes persisted user key %s', key => {
    expect(DEFAULT_UI_PREFERENCES).toHaveProperty(key);
  });

  it('defines canonical DEFAULT_UI_PREFERENCES consumed by scoped preference hooks', () => {
    expect(DEFAULT_UI_PREFERENCES).toMatchObject({
      userName: '',
      theme: 'system',
      themeId: ThemeIds.DEEP_SPACE,
      fontId: FontIds.DEEP_SPACE,
      notificationCadence: 'none',
      notificationHour: 10,
      notificationMinute: 0,
      notificationWeekday: 1,
      defaultShareFormat: ShareFormat.TEXT,
    });
  });
});
