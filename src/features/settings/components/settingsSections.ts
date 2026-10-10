import { AppConfig } from '@/src/constants';
import { Icon, type IconName } from '@/src/components/core';
import { Platform } from 'react-native';
import { PRIVACY_NOTICE_STRINGS } from '@/src/constants/copy/domains/privacyNoticeStrings';

/** Every navigation target the settings hub and search can open. */
export type SettingsActions = {
  onProfile: (target?: string) => void;
  onAppearance: (target?: string) => void;
  onAutomation: (target?: string) => void;
  onSmsSettings: (target?: string) => void;
  onSmsInbox: () => void;
  onSmsRules: () => void;
  onPrivacy: (target?: string) => void;
  onPrivacyNotice: () => void;
  onCurrentWorkplace: (target?: string) => void;
  onDataManagement: (target?: string) => void;
  onMaintenance: (target?: string) => void;
  onAbout: (target?: string) => void;
  onDeviceSettings: (target?: string) => void;
};

/**
 * One settings destination. The same entry feeds settings search and, when it has a `hub`
 * block, a row on the main settings screen.
 */
/**
 * One settings destination. The same entry feeds settings search and, when it has a `hub`
 * block, a row on the main settings screen (under the entry's `section`).
 */
export type SettingsEntry = {
  /** Search id; also the rendered focus target unless `focusId` is set. */
  id: string;
  focusId?: string;
  icon: IconName;
  title: string;
  description: string;
  /** Search breadcrumb, and the main-screen section for hub rows. */
  section: string;
  keywords: string[];
  action: keyof SettingsActions;
  platform?: 'android';
  /** Hub-only rows are not indexed by search. */
  searchable?: false;
  /** Row on the main settings screen; icon/title/description default to the search copy. */
  hub?: { testID: string; icon?: IconName; title?: string; description?: string };
};

export type SettingsSearchItem = Omit<SettingsEntry, 'focusId' | 'action' | 'hub'> & {
  focusId: string;
  navigate: (target: string) => void;
  searchableText: string;
};

type EntryExtras = Partial<Omit<SettingsEntry, 'id' | 'icon' | 'title' | 'description'>>;
type Row = Omit<SettingsEntry, 'section' | 'action'> & EntryExtras;

const row = (
  id: string,
  icon: IconName,
  title: string,
  description: string,
  keywords: string[],
  extras: EntryExtras = {},
): Row => ({ id, icon, title, description, keywords, ...extras });

/** Rows that live on one settings screen (`action`) under one search `section`. */
const screen = (
  section: string,
  action: keyof SettingsActions,
  rows: Row[],
  extras: EntryExtras = {},
): SettingsEntry[] => rows.map(r => ({ section, action, ...extras, ...r }));

const s = AppConfig.strings.settings;
const { sections: sec, hub, personalization: me, appearance: look, privacy, data } = s;
const DISPLAY = 'Preferences · Display Options';
const ANDROID = { platform: 'android' } as const;
const NOTIFICATIONS_HUB_TITLE =
  Platform.OS === 'android' ? s.notifications.automationTitle : s.notifications.title;
const NOTIFICATIONS_HUB_DESCRIPTION =
  Platform.OS === 'android' ? s.notifications.automationDescription : s.notifications.description;

// prettier-ignore
export const SETTINGS_ENTRIES: SettingsEntry[] = [
  ...screen('Your Account', 'onProfile', [
    row('profile', Icon.User, sec.profile, hub.profileDescription, [], { searchable: false, hub: { testID: 'settings-profile' } }),
    row('profile-name', Icon.User, me.yourName, me.yourNameDesc, ['account', 'name', 'profile', 'user']),
    row('devices', Icon.Settings, sec.devicesAndSessions, hub.devicesDescription, ['device', 'session', 'sms import', 'android'], { action: 'onDeviceSettings' }),
  ]),
  ...screen('Workplaces', 'onCurrentWorkplace', [
    row('workplace', Icon.Briefcase, 'Current workplace', 'Rename this workplace or change its icon', ['workplace', 'books', 'rename', 'icon'], {
      hub: { testID: 'settings-current-workplace', title: sec.currentWorkplace, description: hub.currentWorkplaceDescription },
    }),
    row('currency', Icon.Bank, s.currency.title, s.currency.description, ['workplace', 'money', 'currency code', 'default currency']),
    row('safe-to-spend-forecast', Icon.Safe, me.forecastTitle, me.forecastDesc, ['workplace', 'money', 'safe to spend', 'forecast', 'horizon', '30 days', '60 days', '90 days']),
  ]),
  ...screen('Preferences', 'onAutomation', [
    row('notifications', Icon.Notifications, s.notifications.title, s.notifications.description, ['notification', 'reminder', 'schedule', 'daily', 'weekly'], {
      hub: { testID: 'settings-automation', title: NOTIFICATIONS_HUB_TITLE, description: NOTIFICATIONS_HUB_DESCRIPTION },
    }),
  ]),
  ...screen('Preferences', 'onAppearance', [
    row('appearance', Icon.Palette, look.themeTitle, look.themeDesc, ['appearance', 'theme', 'dark mode', 'light mode', 'color'], {
      hub: { testID: 'settings-appearance', title: sec.appearance, description: hub.appearanceDescription },
    }),
    row('appearance-mode', Icon.Sliders, look.modeTitle, 'Choose how the selected theme follows your device.', ['appearance', 'theme', 'system', 'light', 'dark', 'mode'], { focusId: 'mode' }),
    row('typography', Icon.Sparkles, look.typographyTitle, look.typographyDesc, ['appearance', 'font', 'fonts', 'type', 'serif', 'sans']),
    row('time-format', Icon.Clock, look.hourCycleTitle, look.hourCycleDesc, ['appearance', 'time', 'clock', '12 hour', '24 hour']),
  ]),
  ...screen(DISPLAY, 'onAppearance', [
    row('reduce-motion', Icon.Pause, s.reduceMotion.title, s.reduceMotion.description, ['appearance', 'display', 'options', 'reduce motion', 'animation', 'accessibility', 'motion']),
    row('compact-account-picker', Icon.Wallet, s.accountPicker.title, s.accountPicker.description, ['appearance', 'display', 'options', 'accounts', 'compact', 'picker']),
    row('account-statistics', Icon.BarChart, s.stats.title, s.stats.description, ['appearance', 'display', 'options', 'account', 'statistics', 'stats', 'monthly']),
    row('safe-to-spend-chart', Icon.TrendingUp, s.stsChart.title, s.stsChart.description, ['appearance', 'display', 'options', 'safe to spend', 'chart', 'projection']),
  ]),
  ...screen('Preferences', 'onPrivacy', [
    row('privacy-security', Icon.Shield, privacy.title, privacy.description, ['privacy', 'security', 'hide', 'balance'], {
      hub: { testID: 'settings-privacy-security', icon: Icon.ShieldCheck, title: sec.privacyAndSecurity, description: hub.privacySecurityDescription },
    }),
    row('widget-privacy', Icon.EyeOff, privacy.widgetPrivacyTitle, privacy.widgetPrivacyDesc, ['privacy', 'security', 'widget', 'hide']),
    row('app-lock', Icon.Lock, privacy.appLockTitle, privacy.appLockDesc, ['privacy', 'security', 'lock', 'passcode']),
  ]),
  ...screen(`Your Account · ${sec.documents}`, 'onPrivacyNotice', [
    row('privacy-notice', Icon.Document, PRIVACY_NOTICE_STRINGS.title, PRIVACY_NOTICE_STRINGS.subtitle, ['privacy', 'data', 'policy', 'analytics', 'backup', 'local', 'notice']),
  ]),
  ...screen('Data', 'onDataManagement', [
    row('data-management', Icon.Database, data.exportBtn, data.exportDesc, ['data', 'backup', 'export', 'save'], {
      focusId: 'data-export',
      hub: { testID: 'settings-data-management', title: sec.dataManagement, description: hub.dataManagementDescription },
    }),
    row('data-import', Icon.FolderOpen, data.importBtn, data.importDesc, ['data', 'restore', 'import', 'load']),
    row('audit-log', Icon.History, data.auditBtn, data.auditDesc, ['data', 'review', 'history', 'changes', 'audit']),
    row('share-format', Icon.Share, data.shareFormatTitle, data.shareFormatDesc, ['data', 'share', 'format', 'csv', 'text', 'markdown']),
  ]),
  ...screen('Data', 'onMaintenance', [
    row('maintenance', Icon.Wrench, s.maintenance.integrityBtn, s.maintenance.integrityDesc, ['maintenance', 'integrity', 'verify', 'repair', 'books'], {
      focusId: 'integrity',
      hub: { testID: 'settings-maintenance', title: sec.maintenanceAndReset, description: hub.maintenanceDescription },
    }),
    row('journal-balance-audit', Icon.Scale, s.maintenance.balanceAuditBtn, s.maintenance.balanceAuditDesc, ['maintenance', 'unbalanced', 'imbalanced', 'debit', 'credit', 'journal', 'import']),
    row('cleanup', Icon.Delete, s.danger.cleanupBtn, s.danger.cleanupDesc, ['maintenance', 'cleanup', 'purge', 'deleted']),
    row('reset', Icon.Refresh, s.danger.resetBtn, s.danger.resetDesc, ['maintenance', 'reset', 'delete', 'start over']),
  ]),
  ...screen('Support', 'onAbout', [
    row('about-support', Icon.Info, sec.aboutAndSupport, hub.aboutSupportDescription, ['about', 'support', 'help', 'community', 'github', 'version', 'bug'], { hub: { testID: 'settings-about-support' } }),
    row('release-notes', Icon.Document, s.community.releaseNotesTitle, s.community.releaseNotesDesc, ['release', 'changelog', 'updates', 'what changed', 'telegram']),
  ]),
  ...screen(
    'Notifications & Automation',
    'onSmsSettings',
    [
      row('sms-automation-import', Icon.Zap, me.smsImportTitle, hub.smsAutoImportSearchDescription, ['sms', 'import', 'automatic', 'messages']),
      row('sms-auto-post-enabled', Icon.Terminal, me.smsAutoPostEnabledTitle, me.smsAutoPostEnabledDesc, ['sms', 'auto post', 'automatic', 'rules', 'entries']),
      row('sms-review-notifications', Icon.Notifications, me.smsReviewNotificationsTitle, me.smsReviewNotificationsDesc, ['sms', 'notification', 'review', 'alert']),
      row('sms-notification-details', Icon.Notifications, hub.smsNotificationDetailsTitle, hub.smsNotificationDetailsSearchDescription, ['sms', 'privacy', 'preview', 'amount']),
      row('sms-inbox', Icon.MessageSquare, me.smsInboxTitle, me.smsInboxDesc, ['sms', 'inbox', 'messages', 'transactions'], { action: 'onSmsInbox' }),
      row('sms-rules', Icon.Terminal, me.smsAutoPostTitle, me.smsAutoPostDesc, ['sms', 'rules', 'automation', 'auto post'], { action: 'onSmsRules' }),
    ],
    ANDROID,
  ),
];

const isOnPlatform = (entry: SettingsEntry) =>
  entry.platform === undefined || entry.platform === Platform.OS;

export type SettingsHubRow = Pick<SettingsEntry, 'id' | 'action'> &
  Required<Pick<SettingsEntry, 'icon' | 'title' | 'description'>> & { testID: string };

/** Main settings screen sections, in entry order. Built once: the platform never changes. */
export const SETTINGS_HUB_SECTIONS: { header: string; rows: SettingsHubRow[] }[] = [];
for (const entry of SETTINGS_ENTRIES) {
  if (!entry.hub || !isOnPlatform(entry)) continue;
  const { hub: h, section: header } = entry;
  const hubRow = {
    id: entry.id,
    action: entry.action,
    testID: h.testID,
    icon: h.icon ?? entry.icon,
    title: h.title ?? entry.title,
    description: h.description ?? entry.description,
  };
  const existing = SETTINGS_HUB_SECTIONS.find(section => section.header === header);
  if (existing) existing.rows.push(hubRow);
  else SETTINGS_HUB_SECTIONS.push({ header, rows: [hubRow] });
}

export function createSettingsSearchCatalog(actions: SettingsActions): SettingsSearchItem[] {
  return SETTINGS_ENTRIES.filter(entry => entry.searchable !== false && isOnPlatform(entry)).map(
    ({ action, hub: _hub, focusId, ...entry }) => ({
      ...entry,
      focusId: focusId ?? entry.id,
      navigate: actions[action],
      searchableText: [entry.title, entry.description, entry.section, ...entry.keywords]
        .join(' ')
        .toLocaleLowerCase(),
    }),
  );
}

export function filterSettingsSearchItems(
  items: SettingsSearchItem[],
  query: string,
): SettingsSearchItem[] {
  const queryTerms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (queryTerms.length === 0) return [];

  return items.filter(item => queryTerms.every(term => item.searchableText.includes(term)));
}
