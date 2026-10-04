import { AppConfig } from '@/src/constants';
import { Icon, type IconName } from '@/src/components/core';
import { Platform } from 'react-native';
import { PRIVACY_NOTICE_STRINGS } from '@/src/constants/copy/domains/privacyNoticeStrings';

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

type SettingsSearchActions = {
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
 * Searchable leaf settings. Keep this explicit so aliases and platform-specific entries stay
 * intentional instead of depending on the rendered React tree.
 */
export function createSettingsSearchCatalog(actions: SettingsSearchActions): SettingsSearchItem[] {
  const catalog: (Omit<SettingsSearchItem, 'focusId'> & { focusId?: string })[] = [
    {
      id: 'profile-name',
      icon: Icon.User,
      title: AppConfig.strings.settings.personalization.yourName,
      description: AppConfig.strings.settings.personalization.yourNameDesc,
      section: 'Your Account',
      keywords: ['account', 'name', 'profile', 'user'],
      navigate: actions.onProfile,
    },
    {
      id: 'devices',
      icon: Icon.Settings,
      title: AppConfig.strings.settings.sections.devicesAndSessions,
      description: 'This device, local preferences, and future sessions',
      section: 'Your Account',
      keywords: ['device', 'session', 'sms import', 'android'],
      navigate: actions.onDeviceSettings,
    },
    {
      id: 'workplace',
      icon: Icon.Briefcase,
      title: 'Current workplace',
      description: 'Rename this workplace or change its icon',
      section: 'Workplaces',
      keywords: ['workplace', 'books', 'rename', 'icon'],
      navigate: actions.onCurrentWorkplace,
    },
    {
      id: 'currency',
      icon: Icon.Bank,
      title: AppConfig.strings.settings.currency.title,
      description: AppConfig.strings.settings.currency.description,
      section: 'Workplaces',
      keywords: ['workplace', 'money', 'currency code', 'default currency'],
      navigate: actions.onCurrentWorkplace,
    },
    {
      id: 'safe-to-spend-forecast',
      icon: Icon.Safe,
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
      icon: Icon.Notifications,
      title: AppConfig.strings.settings.notifications.title,
      description: AppConfig.strings.settings.notifications.description,
      section: 'Preferences',
      keywords: ['notification', 'reminder', 'schedule', 'daily', 'weekly'],
      navigate: actions.onAutomation,
    },
    {
      id: 'share-format',
      icon: Icon.Share,
      title: AppConfig.strings.settings.data.shareFormatTitle,
      description: AppConfig.strings.settings.data.shareFormatDesc,
      section: 'Data',
      keywords: ['data', 'share', 'format', 'csv', 'text', 'markdown'],
      navigate: actions.onDataManagement,
    },
    {
      id: 'appearance',
      icon: Icon.Palette,
      title: AppConfig.strings.settings.appearance.themeTitle,
      description: AppConfig.strings.settings.appearance.themeDesc,
      section: 'Preferences',
      keywords: ['appearance', 'theme', 'dark mode', 'light mode', 'color'],
      navigate: actions.onAppearance,
    },
    {
      id: 'appearance-mode',
      icon: Icon.Sliders,
      focusId: 'mode',
      title: AppConfig.strings.settings.appearance.modeTitle,
      description: 'Choose how the selected theme follows your device.',
      section: 'Preferences',
      keywords: ['appearance', 'theme', 'system', 'light', 'dark', 'mode'],
      navigate: actions.onAppearance,
    },
    {
      id: 'typography',
      icon: Icon.Sparkles,
      title: AppConfig.strings.settings.appearance.typographyTitle,
      description: AppConfig.strings.settings.appearance.typographyDesc,
      section: 'Preferences',
      keywords: ['appearance', 'font', 'fonts', 'type', 'serif', 'sans'],
      navigate: actions.onAppearance,
    },
    {
      id: 'time-format',
      icon: Icon.Clock,
      title: AppConfig.strings.settings.appearance.hourCycleTitle,
      description: AppConfig.strings.settings.appearance.hourCycleDesc,
      section: 'Preferences',
      keywords: ['appearance', 'time', 'clock', '12 hour', '24 hour'],
      navigate: actions.onAppearance,
    },
    {
      id: 'reduce-motion',
      icon: Icon.Pause,
      title: AppConfig.strings.settings.reduceMotion.title,
      description: AppConfig.strings.settings.reduceMotion.description,
      section: 'Preferences · Display Options',
      keywords: [
        'appearance',
        'display',
        'options',
        'reduce motion',
        'animation',
        'accessibility',
        'motion',
      ],
      navigate: actions.onAppearance,
    },
    {
      id: 'compact-account-picker',
      icon: Icon.Wallet,
      title: AppConfig.strings.settings.accountPicker.title,
      description: AppConfig.strings.settings.accountPicker.description,
      section: 'Preferences · Display Options',
      keywords: ['appearance', 'display', 'options', 'accounts', 'compact', 'picker'],
      navigate: actions.onAppearance,
    },
    {
      id: 'account-statistics',
      icon: Icon.BarChart,
      title: AppConfig.strings.settings.stats.title,
      description: AppConfig.strings.settings.stats.description,
      section: 'Preferences · Display Options',
      keywords: ['appearance', 'display', 'options', 'account', 'statistics', 'stats', 'monthly'],
      navigate: actions.onAppearance,
    },
    {
      id: 'safe-to-spend-chart',
      icon: Icon.TrendingUp,
      title: AppConfig.strings.settings.stsChart.title,
      description: AppConfig.strings.settings.stsChart.description,
      section: 'Preferences · Display Options',
      keywords: ['appearance', 'display', 'options', 'safe to spend', 'chart', 'projection'],
      navigate: actions.onAppearance,
    },
    {
      id: 'privacy-security',
      icon: Icon.Shield,
      title: AppConfig.strings.settings.privacy.title,
      description: AppConfig.strings.settings.privacy.description,
      section: 'Preferences',
      keywords: ['privacy', 'security', 'hide', 'balance'],
      navigate: actions.onPrivacy,
    },
    {
      id: 'widget-privacy',
      icon: Icon.EyeOff,
      title: AppConfig.strings.settings.privacy.widgetPrivacyTitle,
      description: AppConfig.strings.settings.privacy.widgetPrivacyDesc,
      section: 'Preferences',
      keywords: ['privacy', 'security', 'widget', 'hide'],
      navigate: actions.onPrivacy,
    },
    {
      id: 'app-lock',
      icon: Icon.Lock,
      title: AppConfig.strings.settings.privacy.appLockTitle,
      description: AppConfig.strings.settings.privacy.appLockDesc,
      section: 'Preferences',
      keywords: ['privacy', 'security', 'lock', 'passcode'],
      navigate: actions.onPrivacy,
    },
    {
      id: 'privacy-notice',
      icon: Icon.Document,
      title: PRIVACY_NOTICE_STRINGS.title,
      description: PRIVACY_NOTICE_STRINGS.subtitle,
      section: `Your Account · ${AppConfig.strings.settings.sections.documents}`,
      keywords: ['privacy', 'data', 'policy', 'analytics', 'backup', 'local', 'notice'],
      navigate: actions.onPrivacyNotice,
    },
    {
      id: 'data-management',
      icon: Icon.Database,
      focusId: 'data-export',
      title: AppConfig.strings.settings.data.exportBtn,
      description: AppConfig.strings.settings.data.exportDesc,
      section: 'Data',
      keywords: ['data', 'backup', 'export', 'save'],
      navigate: actions.onDataManagement,
    },
    {
      id: 'data-import',
      icon: Icon.FolderOpen,
      title: AppConfig.strings.settings.data.importBtn,
      description: AppConfig.strings.settings.data.importDesc,
      section: 'Data',
      keywords: ['data', 'restore', 'import', 'load'],
      navigate: actions.onDataManagement,
    },
    {
      id: 'audit-log',
      icon: Icon.History,
      title: AppConfig.strings.settings.data.auditBtn,
      description: AppConfig.strings.settings.data.auditDesc,
      section: 'Data',
      keywords: ['data', 'review', 'history', 'changes', 'audit'],
      navigate: actions.onDataManagement,
    },
    {
      id: 'maintenance',
      icon: Icon.Wrench,
      focusId: 'integrity',
      title: AppConfig.strings.settings.maintenance.integrityBtn,
      description: AppConfig.strings.settings.maintenance.integrityDesc,
      section: 'Data',
      keywords: ['maintenance', 'integrity', 'verify', 'repair', 'books'],
      navigate: actions.onMaintenance,
    },
    {
      id: 'journal-balance-audit',
      icon: Icon.Scale,
      title: AppConfig.strings.settings.maintenance.balanceAuditBtn,
      description: AppConfig.strings.settings.maintenance.balanceAuditDesc,
      section: 'Data',
      keywords: ['maintenance', 'unbalanced', 'imbalanced', 'debit', 'credit', 'journal', 'import'],
      navigate: actions.onMaintenance,
    },
    {
      id: 'cleanup',
      icon: Icon.Delete,
      title: AppConfig.strings.settings.danger.cleanupBtn,
      description: AppConfig.strings.settings.danger.cleanupDesc,
      section: 'Data',
      keywords: ['maintenance', 'cleanup', 'purge', 'deleted'],
      navigate: actions.onMaintenance,
    },
    {
      id: 'reset',
      icon: Icon.Refresh,
      title: AppConfig.strings.settings.danger.resetBtn,
      description: AppConfig.strings.settings.danger.resetDesc,
      section: 'Data',
      keywords: ['maintenance', 'reset', 'delete', 'start over'],
      navigate: actions.onMaintenance,
    },
    {
      id: 'about-support',
      icon: Icon.Info,
      title: AppConfig.strings.settings.sections.aboutAndSupport,
      description: 'Community, ratings, source code, and version',
      section: 'Support',
      keywords: ['about', 'support', 'help', 'community', 'github', 'version', 'bug'],
      navigate: actions.onAbout,
    },
    {
      id: 'release-notes',
      icon: Icon.Document,
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
      id: 'sms-settings',
      icon: Icon.MessageSquare,
        title: AppConfig.strings.settings.personalization.smsSettingsTitle,
        description: AppConfig.strings.settings.personalization.smsSettingsDesc,
        section: 'Notifications & Automation',
        keywords: ['sms', 'settings', 'import', 'notifications', 'auto post'],
        focusId: 'sms-automation-import',
        navigate: actions.onSmsSettings,
      },
      {
      id: 'sms-automation-import',
      icon: Icon.Zap,
        title: AppConfig.strings.settings.personalization.smsImportTitle,
        description: 'Automatically scan transaction messages on this device.',
        section: 'Notifications & Automation',
        keywords: ['sms', 'import', 'automatic', 'messages'],
        navigate: actions.onSmsSettings,
      },
      {
      id: 'sms-auto-post-enabled',
      icon: Icon.Terminal,
        title: AppConfig.strings.settings.personalization.smsAutoPostEnabledTitle,
        description: AppConfig.strings.settings.personalization.smsAutoPostEnabledDesc,
        section: 'Notifications & Automation',
        keywords: ['sms', 'auto post', 'automatic', 'rules', 'entries'],
        navigate: actions.onSmsSettings,
      },
      {
      id: 'sms-review-notifications',
      icon: Icon.Notifications,
        title: AppConfig.strings.settings.personalization.smsReviewNotificationsTitle,
        description: AppConfig.strings.settings.personalization.smsReviewNotificationsDesc,
        section: 'Notifications & Automation',
        keywords: ['sms', 'notification', 'review', 'alert'],
        navigate: actions.onSmsSettings,
      },
      {
      id: 'sms-notification-details',
      icon: Icon.Notifications,
        title: 'Detailed SMS previews',
        description: 'Choose whether alerts show transaction details.',
        section: 'Notifications & Automation',
        keywords: ['sms', 'privacy', 'preview', 'amount'],
        navigate: actions.onSmsSettings,
      },
      {
      id: 'sms-inbox',
      icon: Icon.MessageSquare,
        title: AppConfig.strings.settings.personalization.smsInboxTitle,
        description: AppConfig.strings.settings.personalization.smsInboxDesc,
        section: 'Notifications & Automation',
        keywords: ['sms', 'inbox', 'messages', 'transactions'],
        navigate: actions.onSmsInbox,
      },
      {
      id: 'sms-rules',
      icon: Icon.Terminal,
        title: AppConfig.strings.settings.personalization.smsAutoPostTitle,
        description: AppConfig.strings.settings.personalization.smsAutoPostDesc,
        section: 'Notifications & Automation',
        keywords: ['sms', 'rules', 'automation', 'auto post'],
        navigate: actions.onSmsRules,
      },
    );
  }

  return catalog.map(item => ({ ...item, focusId: item.focusId ?? item.id }));
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
