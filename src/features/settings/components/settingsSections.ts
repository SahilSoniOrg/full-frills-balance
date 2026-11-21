import { AppConfig } from '@/src/constants';
import { Icon, type IconName } from '@/src/components/core';
import { Platform } from 'react-native';
import { gmailCaptureStrings } from '@/src/constants/copy/domains/gmailCaptureStrings';
import { transactionCaptureStrings } from '@/src/constants/copy/domains/transactionCaptureStrings';
import { PRIVACY_NOTICE_STRINGS } from '@/src/constants/copy/domains/privacyNoticeStrings';

/** Every navigation target the settings hub and search can open. */
export type SettingsActions = {
  onProfile: (target?: string) => void;
  onAppearance: (target?: string) => void;
  onCaptureWorkspace: (target?: string) => void;
  onSpendingReminders: (target?: string) => void;
  onSmsSettings: (target?: string) => void;
  onSmsInbox: () => void;
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
  /** Limit to one OS, or every native mobile OS (excludes web). */
  platform?: 'android' | 'native';
  /** Runtime gate; omitted entries are always eligible once the platform matches. */
  gate?: keyof SettingsSearchCapabilities;
  /** Hub-only rows are not indexed by search. */
  searchable?: false;
  /** Row on the main settings screen; icon/title/description default to the search copy. */
  hub?: { testID: string; icon?: IconName; title?: string; description?: string };
};

/** Runtime availability for gated search rows (feature flags, connection state, etc.). */
export type SettingsSearchCapabilities = {
  /** Matches Capture & review: feature flag on, or Gmail already connected. */
  gmailCapture: boolean;
  /** Nested Gmail toggles that require an active connection. */
  gmailCaptureConnected: boolean;
  /** Account recognition help: flag on and Gmail connected. */
  gmailCaptureAccountHelp: boolean;
};

export const DEFAULT_SETTINGS_SEARCH_CAPABILITIES: SettingsSearchCapabilities = {
  gmailCapture: false,
  gmailCaptureConnected: false,
  gmailCaptureAccountHelp: false,
};

export type SettingsSearchItem = Omit<SettingsEntry, 'focusId' | 'action' | 'hub' | 'gate'> & {
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
const CAPTURE = transactionCaptureStrings.title;
const ANDROID = { platform: 'android' } as const;
const NATIVE = { platform: 'native' } as const;
// prettier-ignore
export const SETTINGS_ENTRIES: SettingsEntry[] = [
  ...screen('Your Account', 'onProfile', [
    row('profile', Icon.User, sec.profile, hub.profileDescription, [], { searchable: false, hub: { testID: 'settings-profile' } }),
    row('profile-name', Icon.User, me.yourName, me.yourNameDesc, ['account', 'name', 'profile', 'user']),
    row('devices', Icon.Settings, sec.devicesAndSessions, hub.devicesDescription, ['device', 'session', 'sms import', 'android'], { action: 'onDeviceSettings' }),
  ]),
  ...screen('Workplaces', 'onCurrentWorkplace', [
    row('workplace', Icon.Briefcase, 'Current workplace', 'Rename this workplace or change its icon', ['workplace', 'books', 'rename', 'icon'], {
      focusId: 'active-workplace',
      hub: { testID: 'settings-current-workplace', title: sec.workplace, description: hub.currentWorkplaceDescription },
    }),
    row('currency', Icon.Bank, s.currency.title, s.currency.description, ['workplace', 'money', 'currency code', 'default currency']),
    row('safe-to-spend-forecast', Icon.Safe, me.forecastTitle, me.forecastDesc, ['workplace', 'money', 'safe to spend', 'forecast', 'horizon', '30 days', '60 days', '90 days']),
    row('delete-workplace', Icon.Delete, 'Delete workplace', 'Permanently delete this workplace and its books', ['workplace', 'delete', 'remove', 'danger']),
  ]),
  ...screen('Transactions', 'onCaptureWorkspace', [
    row('capture-review', Icon.Zap, transactionCaptureStrings.title, transactionCaptureStrings.description, ['capture', 'review', 'transactions', 'automatic', 'matching'], {
      focusId: 'capture-review',
      hub: { testID: 'settings-capture-review', title: transactionCaptureStrings.title, description: transactionCaptureStrings.description },
    }),
  ]),
  ...screen('Notifications', 'onSpendingReminders', [
    row('spending-reminders', Icon.Notifications, s.notifications.title, s.notifications.description, ['notification', 'reminder', 'schedule', 'daily', 'weekly', 'spending', 'safe to spend', 'log transactions'], {
      focusId: 'notifications',
      hub: { testID: 'settings-spending-reminders' },
    }),
  ]),
  ...screen(CAPTURE, 'onCaptureWorkspace', [
    row('transaction-capture-enabled', Icon.Zap, transactionCaptureStrings.captureTitle, transactionCaptureStrings.captureDescription, ['capture', 'categorization', 'automatic', 'transactions', 'automation']),
    row('transaction-capture-review-queue', Icon.Tag, transactionCaptureStrings.reviewOpenTitle, transactionCaptureStrings.reviewHint, ['capture', 'review', 'categorize', 'uncategorized', 'transactions', 'category']),
    row('transaction-capture-inbox', Icon.MessageSquare, transactionCaptureStrings.inboxTitle, transactionCaptureStrings.inboxDescription, ['capture', 'review', 'inbox', 'transactions', 'import', 'messages']),
    row('transaction-capture-suggestions', Icon.Zap, transactionCaptureStrings.suggestionsTitle, transactionCaptureStrings.suggestionsOverviewDescription, ['capture', 'matching', 'suggestions', 'defaults', 'merchant', 'category', 'rules']),
  ]),
  ...screen(CAPTURE, 'onCaptureWorkspace', [
    row('sms-settings', Icon.MessageSquare, transactionCaptureStrings.smsTitle, transactionCaptureStrings.smsDescription, ['sms', 'settings', 'import', 'messages', 'android', 'capture'], ANDROID),
    row(
      'transaction-capture-gmail',
      Icon.Mail,
      gmailCaptureStrings.title,
      gmailCaptureStrings.disconnected,
      ['gmail', 'email', 'google', 'mail', 'capture', 'inbox', 'connect'],
      { ...NATIVE, gate: 'gmailCapture' },
    ),
    row(
      'transaction-capture-gmail-background',
      Icon.History,
      gmailCaptureStrings.backgroundSetting,
      gmailCaptureStrings.backgroundDescription,
      ['gmail', 'email', 'background', 'checks', 'sync', 'capture'],
      { ...NATIVE, gate: 'gmailCaptureConnected' },
    ),
    row(
      'transaction-capture-gmail-auto',
      Icon.Zap,
      gmailCaptureStrings.automaticSetting,
      gmailCaptureStrings.automaticDescription,
      ['gmail', 'email', 'automatic', 'verified', 'capture', 'dns'],
      { ...NATIVE, gate: 'gmailCaptureConnected' },
    ),
    row(
      'transaction-capture-gmail-accounts',
      Icon.Document,
      gmailCaptureStrings.accountHelp,
      gmailCaptureStrings.accountHelpDescription,
      ['gmail', 'email', 'account', 'sender', 'recognition', 'matcher'],
      { ...NATIVE, gate: 'gmailCaptureAccountHelp' },
    ),
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
    row('telegram', Icon.MessageCircle, s.community.telegramTitle, s.community.telegramDesc, ['about', 'support', 'telegram', 'community', 'chat']),
    row('release-notes', Icon.Document, s.community.releaseNotesTitle, s.community.releaseNotesDesc, ['release', 'changelog', 'updates', 'what changed', 'telegram']),
    row('play-store', Icon.Star, s.community.playStoreTitle, s.community.playStoreDesc, ['about', 'support', 'play store', 'rate', 'review']),
    row('github', Icon.Github, s.community.githubTitle, s.community.githubDesc, ['about', 'support', 'github', 'source', 'issues']),
    row('report-bug', Icon.Bug, 'Report a Bug', 'Share app logs and device info to help fix issues', ['about', 'support', 'bug', 'report', 'logs', 'crash']),
  ]),
  ...screen(
    'Notifications & Automation',
    'onSmsSettings',
    [
      row('sms-automation-import', Icon.Zap, me.smsImportTitle, hub.smsAutoImportSearchDescription, ['sms', 'import', 'automatic', 'messages']),
      row('sms-review-notifications', Icon.Notifications, me.smsReviewNotificationsTitle, me.smsReviewNotificationsDesc, ['sms', 'notification', 'review', 'alert']),
      row('sms-notification-details', Icon.Notifications, hub.smsNotificationDetailsTitle, hub.smsNotificationDetailsSearchDescription, ['sms', 'privacy', 'preview', 'amount']),
      row(
        'sms-inbox',
        Icon.MessageSquare,
        me.transactionInboxTitle,
        me.transactionInboxDesc,
        ['sms', 'inbox', 'messages', 'transactions'],
        { action: 'onSmsInbox' },
      ),
    ],
    ANDROID,
  ),
];

const isOnPlatform = (entry: SettingsEntry) => {
  if (entry.platform === undefined) return true;
  if (entry.platform === 'native') return Platform.OS === 'ios' || Platform.OS === 'android';
  return entry.platform === Platform.OS;
};

const isGateOpen = (entry: SettingsEntry, capabilities: SettingsSearchCapabilities) =>
  entry.gate === undefined || capabilities[entry.gate];

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

export function createSettingsSearchCatalog(
  actions: SettingsActions,
  capabilities: SettingsSearchCapabilities = DEFAULT_SETTINGS_SEARCH_CAPABILITIES,
): SettingsSearchItem[] {
  return SETTINGS_ENTRIES.filter(
    entry => entry.searchable !== false && isOnPlatform(entry) && isGateOpen(entry, capabilities),
  ).map(({ action, hub: _hub, focusId, gate: _gate, ...entry }) => ({
    ...entry,
    focusId: focusId ?? entry.id,
    navigate: actions[action],
    searchableText: [entry.title, entry.description, entry.section, ...entry.keywords]
      .join(' ')
      .toLocaleLowerCase(),
  }));
}

export function filterSettingsSearchItems(
  items: SettingsSearchItem[],
  query: string,
): SettingsSearchItem[] {
  const queryTerms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (queryTerms.length === 0) return [];

  return items.filter(item => queryTerms.every(term => item.searchableText.includes(term)));
}
