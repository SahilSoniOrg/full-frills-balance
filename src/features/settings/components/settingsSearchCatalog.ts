import { AppConfig } from '@/src/constants';
import type { IconName } from '@/src/components/core';
import { Platform } from 'react-native';

export type SettingsSearchItem = {
  id: string;
  icon: IconName;
  title: string;
  description: string;
  section: string;
  keywords: string[];
  onPress: () => void;
};

const SETTINGS_SEARCH_ICONS: Record<string, IconName> = {
  'profile-name': 'user',
  devices: 'settings',
  workplace: 'briefcase',
  currency: 'transaction',
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
  const catalog: Omit<SettingsSearchItem, 'icon'>[] = [
    {
      id: 'profile-name',
      title: AppConfig.strings.settings.personalization.yourName,
      description: AppConfig.strings.settings.personalization.yourNameDesc,
      section: 'Your Account',
      keywords: ['account', 'name', 'profile', 'user'],
      onPress: () => actions.onProfile('profile-name'),
    },
    {
      id: 'devices',
      title: AppConfig.strings.settings.sections.devicesAndSessions,
      description: 'This device, local preferences, and future sessions',
      section: 'Your Account',
      keywords: ['device', 'session', 'sms import', 'android'],
      onPress: () => actions.onDeviceSettings('devices'),
    },
    {
      id: 'workplace',
      title: 'Current workplace',
      description: 'Rename this workplace or change its icon',
      section: 'Workplaces',
      keywords: ['workplace', 'books', 'rename', 'icon'],
      onPress: () => actions.onCurrentWorkplace('workplace'),
    },
    {
      id: 'currency',
      title: AppConfig.strings.settings.currency.title,
      description: AppConfig.strings.settings.currency.description,
      section: 'Workplaces',
      keywords: ['workplace', 'money', 'currency code', 'default currency'],
      onPress: () => actions.onCurrentWorkplace('currency'),
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
      onPress: () => actions.onCurrentWorkplace('safe-to-spend-forecast'),
    },
    {
      id: 'notifications',
      title: AppConfig.strings.settings.notifications.title,
      description: AppConfig.strings.settings.notifications.description,
      section: 'Preferences',
      keywords: ['notification', 'reminder', 'schedule', 'daily', 'weekly'],
      onPress: () => actions.onAutomation('notifications'),
    },
    {
      id: 'share-format',
      title: AppConfig.strings.settings.data.shareFormatTitle,
      description: AppConfig.strings.settings.data.shareFormatDesc,
      section: 'Data',
      keywords: ['data', 'share', 'format', 'csv', 'text', 'markdown'],
      onPress: () => actions.onDataManagement('share-format'),
    },
    {
      id: 'appearance',
      title: AppConfig.strings.settings.appearance.themeTitle,
      description: AppConfig.strings.settings.appearance.themeDesc,
      section: 'Preferences',
      keywords: ['appearance', 'theme', 'dark mode', 'light mode', 'color'],
      onPress: () => actions.onAppearance('appearance'),
    },
    {
      id: 'appearance-mode',
      title: AppConfig.strings.settings.appearance.modeTitle,
      description: 'Choose how the selected theme follows your device.',
      section: 'Preferences',
      keywords: ['appearance', 'theme', 'system', 'light', 'dark', 'mode'],
      onPress: () => actions.onAppearance('mode'),
    },
    {
      id: 'typography',
      title: AppConfig.strings.settings.appearance.typographyTitle,
      description: AppConfig.strings.settings.appearance.typographyDesc,
      section: 'Preferences',
      keywords: ['appearance', 'font', 'fonts', 'type', 'serif', 'sans'],
      onPress: () => actions.onAppearance('typography'),
    },
    {
      id: 'time-format',
      title: AppConfig.strings.settings.appearance.hourCycleTitle,
      description: AppConfig.strings.settings.appearance.hourCycleDesc,
      section: 'Preferences',
      keywords: ['appearance', 'time', 'clock', '12 hour', '24 hour'],
      onPress: () => actions.onAppearance('time-format'),
    },
    {
      id: 'compact-account-picker',
      title: AppConfig.strings.settings.accountPicker.title,
      description: AppConfig.strings.settings.accountPicker.description,
      section: 'Preferences · Display Options',
      keywords: ['appearance', 'display', 'options', 'accounts', 'compact', 'picker'],
      onPress: () => actions.onAppearance('compact-account-picker'),
    },
    {
      id: 'account-statistics',
      title: AppConfig.strings.settings.stats.title,
      description: AppConfig.strings.settings.stats.description,
      section: 'Preferences · Display Options',
      keywords: ['appearance', 'display', 'options', 'account', 'statistics', 'stats', 'monthly'],
      onPress: () => actions.onAppearance('account-statistics'),
    },
    {
      id: 'safe-to-spend-chart',
      title: AppConfig.strings.settings.stsChart.title,
      description: AppConfig.strings.settings.stsChart.description,
      section: 'Preferences · Display Options',
      keywords: ['appearance', 'display', 'options', 'safe to spend', 'chart', 'projection'],
      onPress: () => actions.onAppearance('safe-to-spend-chart'),
    },
    {
      id: 'privacy-security',
      title: AppConfig.strings.settings.privacy.title,
      description: AppConfig.strings.settings.privacy.description,
      section: 'Preferences',
      keywords: ['privacy', 'security', 'hide', 'balance'],
      onPress: () => actions.onPrivacy('privacy-security'),
    },
    {
      id: 'widget-privacy',
      title: AppConfig.strings.settings.privacy.widgetPrivacyTitle,
      description: AppConfig.strings.settings.privacy.widgetPrivacyDesc,
      section: 'Preferences',
      keywords: ['privacy', 'security', 'widget', 'hide'],
      onPress: () => actions.onPrivacy('widget-privacy'),
    },
    {
      id: 'app-lock',
      title: AppConfig.strings.settings.privacy.appLockTitle,
      description: AppConfig.strings.settings.privacy.appLockDesc,
      section: 'Preferences',
      keywords: ['privacy', 'security', 'lock', 'passcode'],
      onPress: () => actions.onPrivacy('app-lock'),
    },
    {
      id: 'data-management',
      title: AppConfig.strings.settings.data.exportBtn,
      description: AppConfig.strings.settings.data.exportDesc,
      section: 'Data',
      keywords: ['data', 'backup', 'export', 'save'],
      onPress: () => actions.onDataManagement('data-export'),
    },
    {
      id: 'data-import',
      title: AppConfig.strings.settings.data.importBtn,
      description: AppConfig.strings.settings.data.importDesc,
      section: 'Data',
      keywords: ['data', 'restore', 'import', 'load'],
      onPress: () => actions.onDataManagement('data-import'),
    },
    {
      id: 'audit-log',
      title: AppConfig.strings.settings.data.auditBtn,
      description: AppConfig.strings.settings.data.auditDesc,
      section: 'Data',
      keywords: ['data', 'review', 'history', 'changes', 'audit'],
      onPress: () => actions.onDataManagement('audit-log'),
    },
    {
      id: 'maintenance',
      title: AppConfig.strings.settings.maintenance.integrityBtn,
      description: AppConfig.strings.settings.maintenance.integrityDesc,
      section: 'Data',
      keywords: ['maintenance', 'integrity', 'verify', 'repair', 'books'],
      onPress: () => actions.onMaintenance('integrity'),
    },
    {
      id: 'cleanup',
      title: AppConfig.strings.settings.danger.cleanupBtn,
      description: AppConfig.strings.settings.danger.cleanupDesc,
      section: 'Data',
      keywords: ['maintenance', 'cleanup', 'purge', 'deleted'],
      onPress: () => actions.onMaintenance('cleanup'),
    },
    {
      id: 'reset',
      title: AppConfig.strings.settings.danger.resetBtn,
      description: AppConfig.strings.settings.danger.resetDesc,
      section: 'Data',
      keywords: ['maintenance', 'reset', 'delete', 'start over'],
      onPress: () => actions.onMaintenance('reset'),
    },
    {
      id: 'about-support',
      title: AppConfig.strings.settings.sections.aboutAndSupport,
      description: 'Community, ratings, source code, and version',
      section: 'Support',
      keywords: ['about', 'support', 'help', 'community', 'github', 'version', 'bug'],
      onPress: () => actions.onAbout('about-support'),
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
        onPress: () => actions.onAutomation('sms-inbox'),
      },
      {
        id: 'sms-rules',
        title: AppConfig.strings.settings.personalization.smsAutoPostTitle,
        description: AppConfig.strings.settings.personalization.smsAutoPostDesc,
        section: 'Notifications & Automation',
        keywords: ['sms', 'rules', 'automation', 'auto post'],
        onPress: () => actions.onAutomation('sms-rules'),
      },
    );
    catalog.push({
      id: 'sms-import',
      title: AppConfig.strings.settings.personalization.smsImportTitle,
      description: 'Automatically scan for transaction messages on this device.',
      section: 'Devices & Sessions',
      keywords: ['sms', 'text message', 'transaction', 'import', 'android'],
      onPress: () => actions.onDeviceSettings('sms-import'),
    });
  }

  return catalog.map(item => {
    const icon = getSettingsSearchIcon(item.id);
    if (!icon) throw new Error(`Missing settings search icon for ${item.id}`);
    return { ...item, icon };
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
