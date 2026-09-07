import { AppConfig } from '@/src/constants';
import type { IconName } from '@/src/components/core';
import { Platform } from 'react-native';

export type SettingsSearchItem = {
  id: string;
  /** Rendered row or section target used by SettingsFocusProvider. */
  focusId: string;
  icon: IconName;
  title: string;
  description: string;
  section: string;
  keywords: string[];
  navigate: (target: string) => void;
};

const SETTINGS_SEARCH_ICONS: Record<string, IconName> = {
  'profile-name': 'user',
  devices: 'settings',
  workplace: 'briefcase',
  currency: 'bank',
  'safe-to-spend-forecast': 'safe',
  notifications: 'notifications',
  'share-format': 'share',
  appearance: 'palette',
  'appearance-mode': 'sliders',
  typography: 'sparkles',
  'time-format': 'clock',
  'compact-account-picker': 'wallet',
  'account-statistics': 'barChart',
  'safe-to-spend-chart': 'trendingUp',
  'privacy-security': 'shield',
  'widget-privacy': 'eyeOff',
  'app-lock': 'lock',
  'data-management': 'database',
  'data-import': 'folderOpen',
  'audit-log': 'history',
  maintenance: 'wrench',
  cleanup: 'delete',
  reset: 'refresh',
  'about-support': 'info',
  'release-notes': 'document',
  'sms-inbox': 'messageSquare',
  'sms-rules': 'terminal',
  'sms-import': 'zap',
};

export function getSettingsSearchIcon(id: string): IconName | undefined {
  return SETTINGS_SEARCH_ICONS[id];
}

type SettingsSearchActions = {
  onProfile: (target?: string) => void;
  onAppearance: (target?: string) => void;
  onAutomation: (target?: string) => void;
  onPrivacy: (target?: string) => void;
  onCurrentWorkplace: (target?: string) => void;
  onDataManagement: (target?: string) => void;
  onMaintenance: (target?: string) => void;
  onAbout: (target?: string) => void;
  onDeviceSettings: (target?: string) => void;
};

/**
 * Searchable leaf settings. Keep this explicit so aliases and platform-specific entries stay
 * intentional instead of depending on the rendered React tree.
 */
export function createSettingsSearchCatalog(actions: SettingsSearchActions): SettingsSearchItem[] {
  const catalog: (Omit<SettingsSearchItem, 'focusId' | 'icon'> & { focusId?: string })[] = [
    {
      id: 'profile-name',
      title: AppConfig.strings.settings.personalization.yourName,
      description: AppConfig.strings.settings.personalization.yourNameDesc,
      section: 'Your Account',
      keywords: ['account', 'name', 'profile', 'user'],
      navigate: actions.onProfile,
    },
    {
      id: 'devices',
      title: AppConfig.strings.settings.sections.devicesAndSessions,
      description: 'This device, local preferences, and future sessions',
      section: 'Your Account',
      keywords: ['device', 'session', 'sms import', 'android'],
      navigate: actions.onDeviceSettings,
    },
    {
      id: 'workplace',
      title: 'Current workplace',
      description: 'Rename this workplace or change its icon',
      section: 'Workplaces',
      keywords: ['workplace', 'books', 'rename', 'icon'],
      navigate: actions.onCurrentWorkplace,
    },
    {
      id: 'currency',
      title: AppConfig.strings.settings.currency.title,
      description: AppConfig.strings.settings.currency.description,
      section: 'Workplaces',
      keywords: ['workplace', 'money', 'currency code', 'default currency'],
      navigate: actions.onCurrentWorkplace,
    },
    {
      id: 'safe-to-spend-forecast',
      title: AppConfig.strings.settings.personalization.forecastTitle,
      description: AppConfig.strings.settings.personalization.forecastDesc,
      section: 'Workplaces',
      keywords: [
        'workplace',
        'money',
        'safe to spend',
        'forecast',
        'horizon',
        '30 days',
        '60 days',
        '90 days',
      ],
      navigate: actions.onCurrentWorkplace,
    },
    {
      id: 'notifications',
      title: AppConfig.strings.settings.notifications.title,
      description: AppConfig.strings.settings.notifications.description,
      section: 'Preferences',
      keywords: ['notification', 'reminder', 'schedule', 'daily', 'weekly'],
      navigate: actions.onAutomation,
    },
    {
      id: 'share-format',
      title: AppConfig.strings.settings.data.shareFormatTitle,
      description: AppConfig.strings.settings.data.shareFormatDesc,
      section: 'Data',
      keywords: ['data', 'share', 'format', 'csv', 'text', 'markdown'],
      navigate: actions.onDataManagement,
    },
    {
      id: 'appearance',
      title: AppConfig.strings.settings.appearance.themeTitle,
      description: AppConfig.strings.settings.appearance.themeDesc,
      section: 'Preferences',
      keywords: ['appearance', 'theme', 'dark mode', 'light mode', 'color'],
      navigate: actions.onAppearance,
    },
    {
      id: 'appearance-mode',
      focusId: 'mode',
      title: AppConfig.strings.settings.appearance.modeTitle,
      description: 'Choose how the selected theme follows your device.',
      section: 'Preferences',
      keywords: ['appearance', 'theme', 'system', 'light', 'dark', 'mode'],
      navigate: actions.onAppearance,
    },
    {
      id: 'typography',
      title: AppConfig.strings.settings.appearance.typographyTitle,
      description: AppConfig.strings.settings.appearance.typographyDesc,
      section: 'Preferences',
      keywords: ['appearance', 'font', 'fonts', 'type', 'serif', 'sans'],
      navigate: actions.onAppearance,
    },
    {
      id: 'time-format',
      title: AppConfig.strings.settings.appearance.hourCycleTitle,
      description: AppConfig.strings.settings.appearance.hourCycleDesc,
      section: 'Preferences',
      keywords: ['appearance', 'time', 'clock', '12 hour', '24 hour'],
      navigate: actions.onAppearance,
    },
    {
      id: 'compact-account-picker',
      title: AppConfig.strings.settings.accountPicker.title,
      description: AppConfig.strings.settings.accountPicker.description,
      section: 'Preferences · Display Options',
      keywords: ['appearance', 'display', 'options', 'accounts', 'compact', 'picker'],
      navigate: actions.onAppearance,
    },
    {
      id: 'account-statistics',
      title: AppConfig.strings.settings.stats.title,
      description: AppConfig.strings.settings.stats.description,
      section: 'Preferences · Display Options',
      keywords: ['appearance', 'display', 'options', 'account', 'statistics', 'stats', 'monthly'],
      navigate: actions.onAppearance,
    },
    {
      id: 'safe-to-spend-chart',
      title: AppConfig.strings.settings.stsChart.title,
      description: AppConfig.strings.settings.stsChart.description,
      section: 'Preferences · Display Options',
      keywords: ['appearance', 'display', 'options', 'safe to spend', 'chart', 'projection'],
      navigate: actions.onAppearance,
    },
    {
      id: 'privacy-security',
      title: AppConfig.strings.settings.privacy.title,
      description: AppConfig.strings.settings.privacy.description,
      section: 'Preferences',
      keywords: ['privacy', 'security', 'hide', 'balance'],
      navigate: actions.onPrivacy,
    },
    {
      id: 'widget-privacy',
      title: AppConfig.strings.settings.privacy.widgetPrivacyTitle,
      description: AppConfig.strings.settings.privacy.widgetPrivacyDesc,
      section: 'Preferences',
      keywords: ['privacy', 'security', 'widget', 'hide'],
      navigate: actions.onPrivacy,
    },
    {
      id: 'app-lock',
      title: AppConfig.strings.settings.privacy.appLockTitle,
      description: AppConfig.strings.settings.privacy.appLockDesc,
      section: 'Preferences',
      keywords: ['privacy', 'security', 'lock', 'passcode'],
      navigate: actions.onPrivacy,
    },
    {
      id: 'data-management',
      focusId: 'data-export',
      title: AppConfig.strings.settings.data.exportBtn,
      description: AppConfig.strings.settings.data.exportDesc,
      section: 'Data',
      keywords: ['data', 'backup', 'export', 'save'],
      navigate: actions.onDataManagement,
    },
    {
      id: 'data-import',
      title: AppConfig.strings.settings.data.importBtn,
      description: AppConfig.strings.settings.data.importDesc,
      section: 'Data',
      keywords: ['data', 'restore', 'import', 'load'],
      navigate: actions.onDataManagement,
    },
    {
      id: 'audit-log',
      title: AppConfig.strings.settings.data.auditBtn,
      description: AppConfig.strings.settings.data.auditDesc,
      section: 'Data',
      keywords: ['data', 'review', 'history', 'changes', 'audit'],
      navigate: actions.onDataManagement,
    },
    {
      id: 'maintenance',
      focusId: 'integrity',
      title: AppConfig.strings.settings.maintenance.integrityBtn,
      description: AppConfig.strings.settings.maintenance.integrityDesc,
      section: 'Data',
      keywords: ['maintenance', 'integrity', 'verify', 'repair', 'books'],
      navigate: actions.onMaintenance,
    },
    {
      id: 'cleanup',
      title: AppConfig.strings.settings.danger.cleanupBtn,
      description: AppConfig.strings.settings.danger.cleanupDesc,
      section: 'Data',
      keywords: ['maintenance', 'cleanup', 'purge', 'deleted'],
      navigate: actions.onMaintenance,
    },
    {
      id: 'reset',
      title: AppConfig.strings.settings.danger.resetBtn,
      description: AppConfig.strings.settings.danger.resetDesc,
      section: 'Data',
      keywords: ['maintenance', 'reset', 'delete', 'start over'],
      navigate: actions.onMaintenance,
    },
    {
      id: 'about-support',
      title: AppConfig.strings.settings.sections.aboutAndSupport,
      description: 'Community, ratings, source code, and version',
      section: 'Support',
      keywords: ['about', 'support', 'help', 'community', 'github', 'version', 'bug'],
      navigate: actions.onAbout,
    },
    {
      id: 'release-notes',
      title: AppConfig.strings.settings.community.releaseNotesTitle,
      description: AppConfig.strings.settings.community.releaseNotesDesc,
      section: 'Support',
      keywords: ['release', 'changelog', 'updates', 'what changed', 'telegram'],
      navigate: actions.onAbout,
    },
  ];

  if (Platform.OS === 'android') {
    catalog.push(
      {
        id: 'sms-inbox',
        title: AppConfig.strings.settings.personalization.smsInboxTitle,
        description: AppConfig.strings.settings.personalization.smsInboxDesc,
        section: 'Notifications & Automation',
        keywords: ['sms', 'inbox', 'messages', 'transactions'],
        navigate: actions.onAutomation,
      },
      {
        id: 'sms-rules',
        title: AppConfig.strings.settings.personalization.smsAutoPostTitle,
        description: AppConfig.strings.settings.personalization.smsAutoPostDesc,
        section: 'Notifications & Automation',
        keywords: ['sms', 'rules', 'automation', 'auto post'],
        navigate: actions.onAutomation,
      },
    );
    catalog.push({
      id: 'sms-import',
      title: AppConfig.strings.settings.personalization.smsImportTitle,
      description: 'Automatically scan for transaction messages on this device.',
      section: 'Devices & Sessions',
      keywords: ['sms', 'text message', 'transaction', 'import', 'android'],
      navigate: actions.onDeviceSettings,
    });
  }

  return catalog.map(item => {
    const icon = getSettingsSearchIcon(item.id);
    if (!icon) throw new Error(`Missing settings search icon for ${item.id}`);
    return { ...item, focusId: item.focusId ?? item.id, icon };
  });
}

export function filterSettingsSearchItems(
  items: SettingsSearchItem[],
  query: string,
): SettingsSearchItem[] {
  const queryTerms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (queryTerms.length === 0) return [];

  return items.filter(item => {
    const searchableText = [item.title, item.description, item.section, ...item.keywords]
      .join(' ')
      .toLocaleLowerCase();
    return queryTerms.every(term => searchableText.includes(term));
  });
}
