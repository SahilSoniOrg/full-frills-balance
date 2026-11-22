import {
  createSettingsSearchCatalog,
  filterSettingsSearchItems,
  type SettingsSearchCapabilities,
} from '@/src/features/settings/components/settingsSections';
import { Platform } from 'react-native';

const actions = {
  onProfile: jest.fn(),
  onAppearance: jest.fn(),
  onCaptureWorkspace: jest.fn(),
  onSpendingReminders: jest.fn(),
  onSmsSettings: jest.fn(),
  onSmsInbox: jest.fn(),
  onPrivacy: jest.fn(),
  onPrivacyNotice: jest.fn(),
  onCurrentWorkplace: jest.fn(),
  onDataManagement: jest.fn(),
  onMaintenance: jest.fn(),
  onAbout: jest.fn(),
  onDeviceSettings: jest.fn(),
};

const openGates: SettingsSearchCapabilities = {
  gmailCapture: true,
  gmailCaptureConnected: true,
  gmailCaptureAccountHelp: true,
};
const sectionOnlyGates: SettingsSearchCapabilities = {
  gmailCapture: true,
  gmailCaptureConnected: false,
  gmailCaptureAccountHelp: false,
};
const closedGates: SettingsSearchCapabilities = {
  gmailCapture: false,
  gmailCaptureConnected: false,
  gmailCaptureAccountHelp: false,
};

const IOS_FOCUS_TARGET_IDS = [
  'profile-name',
  'devices',
  'active-workplace',
  'currency',
  'safe-to-spend-forecast',
  'delete-workplace',
  'capture-review',
  'notifications',
  'transaction-capture-enabled',
  'transaction-capture-review-queue',
  'transaction-capture-inbox',
  'transaction-capture-suggestions',
  'transaction-capture-gmail',
  'transaction-capture-gmail-background',
  'transaction-capture-gmail-auto',
  'transaction-capture-gmail-accounts',
  'share-format',
  'appearance',
  'mode',
  'typography',
  'time-format',
  'compact-account-picker',
  'account-statistics',
  'safe-to-spend-chart',
  'reduce-motion',
  'privacy-security',
  'widget-privacy',
  'app-lock',
  'privacy-notice',
  'data-export',
  'data-import',
  'audit-log',
  'integrity',
  'journal-balance-audit',
  'cleanup',
  'reset',
  'about-support',
  'telegram',
  'release-notes',
  'play-store',
  'github',
  'report-bug',
  'sms-inbox',
];

const ANDROID_FOCUS_TARGET_IDS = [
  ...IOS_FOCUS_TARGET_IDS,
  'sms-settings',
  'sms-automation-import',
  'sms-review-notifications',
  'sms-notification-details',
];

describe('settings search catalog', () => {
  it('enumerates every search focus id with a rendered settings target', () => {
    const originalPlatformOS = Platform.OS;

    for (const [platform, expectedFocusIds] of [
      ['ios', IOS_FOCUS_TARGET_IDS],
      ['android', ANDROID_FOCUS_TARGET_IDS],
    ] as const) {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: platform });
      const catalogFocusIds = createSettingsSearchCatalog(actions, openGates).map(
        item => item.focusId,
      );

      expect(new Set(catalogFocusIds).size).toBe(expectedFocusIds.length);
      expect(new Set(catalogFocusIds)).toEqual(new Set(expectedFocusIds));
    }

    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatformOS });
  });

  it('matches titles, descriptions, and aliases', () => {
    const catalog = createSettingsSearchCatalog(actions, openGates);

    expect(filterSettingsSearchItems(catalog, 'lock').map(item => item.id)).toContain('app-lock');
    expect(filterSettingsSearchItems(catalog, 'money horizon').map(item => item.id)).toContain(
      'safe-to-spend-forecast',
    );
    expect(filterSettingsSearchItems(catalog, '  APPEARANCE  ').length).toBeGreaterThan(0);
    expect(filterSettingsSearchItems(catalog, 'categorize').map(item => item.id)).toContain(
      'transaction-capture-review-queue',
    );
    expect(
      filterSettingsSearchItems(catalog, 'matching suggestions').map(item => item.id),
    ).toContain('transaction-capture-suggestions');
    expect(filterSettingsSearchItems(catalog, 'gmail').map(item => item.id)).toContain(
      'transaction-capture-gmail',
    );
    expect(filterSettingsSearchItems(catalog, 'background checks').map(item => item.id)).toContain(
      'transaction-capture-gmail-background',
    );
    expect(filterSettingsSearchItems(catalog, 'verified gmail').map(item => item.id)).toContain(
      'transaction-capture-gmail-auto',
    );
    expect(
      filterSettingsSearchItems(catalog, 'recognize an account').map(item => item.id),
    ).toContain('transaction-capture-gmail-accounts');
  });

  it('hides Gmail search results when the capture gate is closed', () => {
    const catalog = createSettingsSearchCatalog(actions, closedGates);

    expect(catalog.find(item => item.id === 'transaction-capture-gmail')).toBeUndefined();
    expect(filterSettingsSearchItems(catalog, 'gmail')).toEqual([]);
  });

  it('keeps the Gmail row without nested controls until Gmail is connected', () => {
    const catalog = createSettingsSearchCatalog(actions, sectionOnlyGates);

    expect(catalog.find(item => item.id === 'transaction-capture-gmail')).toBeDefined();
    expect(
      catalog.find(item => item.id === 'transaction-capture-gmail-background'),
    ).toBeUndefined();
    expect(catalog.find(item => item.id === 'transaction-capture-gmail-auto')).toBeUndefined();
    expect(catalog.find(item => item.id === 'transaction-capture-gmail-accounts')).toBeUndefined();
  });

  it('returns no results for an empty query', () => {
    const catalog = createSettingsSearchCatalog(actions, openGates);

    expect(filterSettingsSearchItems(catalog, '')).toEqual([]);
    expect(filterSettingsSearchItems(catalog, '   ')).toEqual([]);
  });

  it('keeps the destination callback on each result', () => {
    const catalog = createSettingsSearchCatalog(actions, openGates);
    const result = filterSettingsSearchItems(catalog, 'currency')[0];
    const shareFormat = filterSettingsSearchItems(catalog, 'share format')[0];

    result.navigate(result.focusId);
    shareFormat.navigate(shareFormat.focusId);
    expect(actions.onCurrentWorkplace).toHaveBeenCalledWith(result.focusId);
    expect(actions.onDataManagement).toHaveBeenCalledWith('share-format');
  });

  it('uses the rendered focus target as the navigation target', () => {
    const catalog = createSettingsSearchCatalog(actions, openGates);
    const appearanceMode = catalog.find(item => item.id === 'appearance-mode');
    const dataManagement = catalog.find(item => item.id === 'data-management');

    if (appearanceMode) appearanceMode.navigate(appearanceMode.focusId);
    if (dataManagement) dataManagement.navigate(dataManagement.focusId);

    expect(actions.onAppearance).toHaveBeenCalledWith(appearanceMode?.focusId);
    expect(actions.onDataManagement).toHaveBeenCalledWith(dataManagement?.focusId);
  });

  it('records the rendered focus target when it differs from the search id', () => {
    const catalog = createSettingsSearchCatalog(actions, openGates);

    expect(catalog.find(item => item.id === 'appearance-mode')?.focusId).toBe('mode');
    expect(catalog.find(item => item.id === 'data-management')?.focusId).toBe('data-export');
    expect(catalog.find(item => item.id === 'maintenance')?.focusId).toBe('integrity');
    expect(catalog.every(item => item.focusId.length > 0)).toBe(true);
  });

  it('routes SMS preference search results into SMS settings and keeps the inbox shortcut direct', () => {
    const originalPlatformOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    const catalog = createSettingsSearchCatalog(actions, openGates);
    const smsImport = catalog.find(item => item.id === 'sms-automation-import')!;
    const smsInbox = catalog.find(item => item.id === 'sms-inbox')!;

    smsImport.navigate(smsImport.focusId);
    smsInbox.navigate(smsInbox.focusId);

    expect(actions.onSmsSettings).toHaveBeenCalledWith('sms-automation-import');
    expect(actions.onSmsInbox).toHaveBeenCalled();
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatformOS });
  });
});
