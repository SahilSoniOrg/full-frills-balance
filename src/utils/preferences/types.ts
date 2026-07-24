import { FontId, FontIds, ThemeId, ThemeIds } from '@/src/constants/design-tokens';
import { AccountId, WorkplaceId } from '@/src/types/domain';
import { ShareFormat } from '@/src/types/sharing';
import { AppConfig } from '@/src/constants/app-config';

export interface UIPreferences {
  onboardingCompleted: boolean;
  userName?: string;
  lastSelectedAccountId?: AccountId;
  lastDateRange?: {
    startDate: number;
    endDate: number;
  };
  theme?: 'light' | 'dark' | 'system';
  themeId?: ThemeId;
  fontId?: FontId;
  lastUsedSourceAccountId?: AccountId;
  lastUsedDestinationAccountId?: AccountId;
  isPrivacyMode: boolean;
  isWidgetPrivacyEnabled: boolean;
  isAppLockEnabled: boolean;
  showAccountMonthlyStats: boolean;
  advancedMode: boolean;
  archetype?: string;
  dismissedPatternIds: string[];
  anonymizedId?: string;
  notificationCadence: 'none' | 'daily' | 'weekly';
  notificationHour: number;
  notificationMinute: number;
  notificationWeekday: number; // 1-7 (Mon-Sun)
  isSmsImportEnabled: boolean;
  isNativeAiEnabled: boolean;
  preferredAiModelId?: string;
  aiInferenceMode: 'single' | 'multi';
  defaultShareFormat?: ShareFormat;
  safeToSpendDays: number;
  activeWorkplaceId?: WorkplaceId;
}

export type ThemeAppearance = 'light' | 'dark' | 'system';

export type ThemePrefs = Pick<UIPreferences, 'theme' | 'themeId' | 'fontId'>;
export type PrivacyPrefs = Pick<
  UIPreferences,
  'isPrivacyMode' | 'isWidgetPrivacyEnabled' | 'isAppLockEnabled'
>;
export type AiPrefs = Pick<
  UIPreferences,
  'isNativeAiEnabled' | 'preferredAiModelId' | 'aiInferenceMode'
>;
export type SmsPrefs = Pick<UIPreferences, 'isSmsImportEnabled'>;
export type StsPrefs = Pick<UIPreferences, 'safeToSpendDays'>;
export type NotificationPrefs = Pick<
  UIPreferences,
  'notificationCadence' | 'notificationHour' | 'notificationMinute' | 'notificationWeekday'
>;

export const DEFAULT_UI_PREFERENCES: UIPreferences = {
  onboardingCompleted: false,
  userName: '',
  isPrivacyMode: false,
  isWidgetPrivacyEnabled: false,
  isAppLockEnabled: false,
  showAccountMonthlyStats: true,
  advancedMode: false,
  themeId: ThemeIds.DEEP_SPACE,
  fontId: FontIds.DEEP_SPACE,
  archetype: undefined,
  dismissedPatternIds: [],
  anonymizedId: undefined,
  notificationCadence: 'none',
  notificationHour: 10,
  notificationMinute: 0,
  notificationWeekday: 1, // Monday
  isSmsImportEnabled: false,
  isNativeAiEnabled: false,
  preferredAiModelId: AppConfig.defaults.defaultAiModelId,
  aiInferenceMode: 'multi',
  defaultShareFormat: ShareFormat.TEXT,
  safeToSpendDays: AppConfig.defaults.safeToSpendDays,
  activeWorkplaceId: undefined,
};

export const PREFERENCES_KEY = 'full_frills_balance_ui_preferences';
export const LEGACY_PREFERENCE_KEYS = ['defaultCurrencyCode', 'defaultCurrency'] as const;
