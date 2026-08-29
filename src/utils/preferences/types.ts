import { FontId, FontIds, ThemeId, ThemeIds } from '@/src/constants/design-tokens';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { ShareFormat } from '@/src/types/sharing';
import { AppConfig } from '@/src/constants/app-config';
import type { HourCyclePreference } from '@/src/utils/hourCycle';

export interface UIPreferences {
  onboardingCompleted: boolean;
  userName?: string;
  lastSelectedAccountId?: AccountId;
  lastDateRange?: {
    startDate: number;
    endDate: number;
  };
  theme?: 'light' | 'dark' | 'system';
  hourCyclePreference?: HourCyclePreference;
  themeId?: ThemeId;
  fontId?: FontId;
  lastUsedSourceAccountId?: AccountId;
  lastUsedDestinationAccountId?: AccountId;
  isPrivacyMode: boolean;
  isWidgetPrivacyEnabled: boolean;
  isAppLockEnabled: boolean;
  showAccountMonthlyStats: boolean;
  useCompactAccountPicker: boolean;
  advancedMode: boolean;
  archetype?: string;
  dismissedPatternIds: string[];
  anonymizedId?: string;
  notificationCadence: 'none' | 'daily' | 'weekly';
  notificationHour: number;
  notificationMinute: number;
  notificationWeekday: number; // 1-7 (Mon-Sun)
  isSmsImportEnabled: boolean;
  defaultShareFormat?: ShareFormat;
  safeToSpendDays: number;
  showSafeToSpendChart: boolean;
  activeWorkplaceId?: WorkplaceId;
}

export type ThemeAppearance = 'light' | 'dark' | 'system';

export type ThemePrefs = Pick<UIPreferences, 'theme' | 'themeId' | 'fontId'>;
export type PrivacyPrefs = Pick<
  UIPreferences,
  'isPrivacyMode' | 'isWidgetPrivacyEnabled' | 'isAppLockEnabled'
>;
export type SmsPrefs = Pick<UIPreferences, 'isSmsImportEnabled'>;
export type StsPrefs = Pick<UIPreferences, 'safeToSpendDays'>;
export type DashboardPrefs = Pick<UIPreferences, 'showSafeToSpendChart'>;
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
  useCompactAccountPicker: false,
  advancedMode: false,
  themeId: ThemeIds.DEEP_SPACE,
  fontId: FontIds.DEEP_SPACE,
  hourCyclePreference: 'system',
  archetype: undefined,
  dismissedPatternIds: [],
  anonymizedId: undefined,
  notificationCadence: 'none',
  notificationHour: 10,
  notificationMinute: 0,
  notificationWeekday: 1, // Monday
  isSmsImportEnabled: false,
  defaultShareFormat: ShareFormat.TEXT,
  safeToSpendDays: AppConfig.defaults.safeToSpendDays,
  showSafeToSpendChart: true,
  activeWorkplaceId: undefined,
};

export const PREFERENCES_KEY = 'full_frills_balance_ui_preferences';
export const LEGACY_PREFERENCE_KEYS = ['defaultCurrencyCode', 'defaultCurrency'] as const;
/** Dropped with the local LiteRT stack (FUL-43). Stripped on load so they leave MMKV. */
export const REMOVED_PREFERENCE_KEYS = [
  'isNativeAiEnabled',
  'preferredAiModelId',
  'aiInferenceMode',
] as const;
