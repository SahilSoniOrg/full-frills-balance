import { FocusTarget } from '@/src/components/shared/FocusTarget';
import { AboutSupportSettingsView } from '@/src/features/settings/components/AboutSupportSettingsView';
import { AppearanceSettingsView } from '@/src/features/settings/components/AppearanceSettingsView';
import { AutomationSettingsView } from '@/src/features/settings/components/AutomationSettingsView';
import { CurrentWorkplaceSettingsView } from '@/src/features/settings/components/CurrentWorkplaceSettingsView';
import { DeviceSettingsView } from '@/src/features/settings/components/DeviceSettingsView';
import { PersonalizationSettingsView } from '@/src/features/settings/components/PersonalizationSettingsView';
import { PrivacySecuritySettingsView } from '@/src/features/settings/components/PrivacySecuritySettingsView';
import { SettingsView } from '@/src/features/settings/components/SettingsView';
import { SmsSettingsView } from '@/src/features/settings/components/SmsSettingsView';
import { render } from '@/src/utils/test-utils';
import type { ReactElement } from 'react';
import { Platform } from 'react-native';

jest.mock('@/src/components/workplace/WorkplaceSwitcher', () => ({
  WorkplaceSwitcher: () => null,
}));
jest.mock('@/src/contexts/WorkplaceContext', () => ({
  ...jest.requireActual('@/src/contexts/WorkplaceContext'),
  useOptionalWorkplace: () => null,
}));
jest.mock('@/src/hooks/useWorkplaceSnapshot', () => ({
  useWorkplaceSnapshot: () => ({ data: undefined }),
}));
jest.mock('@/src/components/filters/DateTimePickerModal', () => ({
  DateTimePickerModal: () => null,
}));
jest.mock('@/src/features/accounts', () => ({ CurrencySelector: () => null }));

const fn = () => jest.fn();
const actions = {
  onProfile: fn(),
  onAppearance: fn(),
  onAutomation: fn(),
  onSmsSettings: fn(),
  onSmsInbox: fn(),
  onSmsRules: fn(),
  onPrivacy: fn(),
  onPrivacyNotice: fn(),
  onCurrentWorkplace: fn(),
  onDataManagement: fn(),
  onMaintenance: fn(),
  onAbout: fn(),
  onDeviceSettings: fn(),
};

const screens: Record<string, () => ReactElement> = {
  hub: () => <SettingsView actions={actions} {...(actions as any)} />,
  appearance: () => (
    <AppearanceSettingsView
      vm={
        {
          themeId: 'deep-space',
          themePreference: 'system',
          hourCyclePreference: 'system',
          resolvedHourCycle: '12-hour',
          fontId: 'deep-space',
          reduceMotion: false,
          useCompactAccountPicker: false,
          showAccountMonthlyStats: false,
          showSafeToSpendChart: true,
          setThemeId: fn(),
          setThemePreference: fn(),
          setHourCyclePreference: fn(),
          setFontId: fn(),
          onToggleReduceMotion: fn(),
          onToggleCompactAccountPicker: fn(),
          onToggleAccountMonthlyStats: fn(),
          onToggleSafeToSpendChart: fn(),
        } as any
      }
    />
  ),
  privacy: () => (
    <PrivacySecuritySettingsView
      vm={
        {
          isPrivacyMode: false,
          isWidgetPrivacyEnabled: false,
          isAppLockEnabled: false,
          onTogglePrivacy: fn(),
          onToggleWidgetPrivacy: fn(),
          onToggleAppLock: fn(),
        } as any
      }
    />
  ),
  profile: () => (
    <PersonalizationSettingsView
      vm={
        {
          draftName: '',
          setDraftName: fn(),
          commitName: fn(),
          onOpenPrivacyNotice: fn(),
        } as any
      }
    />
  ),
  about: () => (
    <AboutSupportSettingsView
      vm={
        {
          onOpenTelegram: fn(),
          onOpenReleaseNotes: fn(),
          onOpenPlayStore: fn(),
          onOpenGithub: fn(),
          onShareBugReport: fn(),
          onSaveBugReport: fn(),
        } as any
      }
    />
  ),
  workplace: () => (
    <CurrentWorkplaceSettingsView
      vm={
        {
          activeWorkplace: null,
          workplaceName: 'Home',
          workplaceCurrency: 'INR',
          currencies: [],
          onUpdateCurrency: fn(),
          safeToSpendDays: 30,
          setSafeToSpendDays: fn(),
          updateWorkplaceDetails: fn(),
        } as any
      }
    />
  ),
  devices: () => <DeviceSettingsView />,
  automation: () => (
    <AutomationSettingsView
      notifications={
        {
          notificationCadence: 'daily',
          notificationHour: 9,
          notificationMinute: 0,
          notificationWeekday: 1,
          onUpdateNotificationCadence: fn(),
          onUpdateNotificationTime: fn(),
          onSendTestNotification: fn(),
        } as any
      }
      onOpenSmsSettings={fn()}
    />
  ),
  sms: () => (
    <SmsSettingsView
      isAutomaticSmsImportEnabled
      isSmsAutoPostEnabled={false}
      areSmsReviewNotificationsEnabled
      showSmsNotificationDetails={false}
      notificationsBlocked={false}
      onToggleSmsNotificationDetails={fn()}
      onToggleSmsImport={fn()}
      onToggleSmsAutoPost={fn()}
      onToggleSmsReviewNotifications={fn()}
      onOpenInbox={fn()}
      onOpenSmsRules={fn()}
    />
  ),
};

function targetsOf(element: ReactElement) {
  const view = render(element);
  const testIDs = view.UNSAFE_root.findAll(
    node => typeof node.type === 'string' && typeof node.props.testID === 'string',
  ).map(node => node.props.testID as string);
  const focusIds = view.UNSAFE_getAllByType(FocusTarget).map(node => node.props.targetId as string);
  view.unmount();
  return { testIDs: [...new Set(testIDs)].sort(), focusIds: [...new Set(focusIds)].sort() };
}

describe('settings screens keep their e2e testIDs and search focus targets', () => {
  const originalOS = Platform.OS;
  beforeAll(() => Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' }));
  afterAll(() => Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS }));

  it.each(Object.keys(screens))('%s', name => {
    expect(targetsOf(screens[name]())).toMatchSnapshot();
  });
});
