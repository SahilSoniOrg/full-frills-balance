import { FontId, FontIds, ThemeId, ThemeIds } from '@/src/constants/design-tokens';
import { ShareFormat } from '@/src/types/sharing';
import type { HourCyclePreference } from '@/src/utils/hourCycle';

/** Chrome and identity that follow the person across workplaces. */
export interface UIPreferences {
  userName?: string;
  theme?: 'light' | 'dark' | 'system';
  hourCyclePreference?: HourCyclePreference;
  themeId?: ThemeId;
  fontId?: FontId;
  isPrivacyMode: boolean;
  isWidgetPrivacyEnabled: boolean;
  showAccountMonthlyStats: boolean;
  useCompactAccountPicker: boolean;
  advancedMode: boolean;
  notificationCadence: 'none' | 'daily' | 'weekly';
  notificationHour: number;
  notificationMinute: number;
  notificationWeekday: number; // 1-7 (Mon-Sun)
  defaultShareFormat?: ShareFormat;
  showSafeToSpendChart: boolean;
}

export type ThemeAppearance = 'light' | 'dark' | 'system';

export type ThemePrefs = Pick<UIPreferences, 'theme' | 'themeId' | 'fontId'>;
export type PrivacyPrefs = Pick<UIPreferences, 'isPrivacyMode' | 'isWidgetPrivacyEnabled'>;
export type DashboardPrefs = Pick<UIPreferences, 'showSafeToSpendChart'>;
export type NotificationPrefs = Pick<
  UIPreferences,
  'notificationCadence' | 'notificationHour' | 'notificationMinute' | 'notificationWeekday'
>;

export const DEFAULT_UI_PREFERENCES: UIPreferences = {
  userName: '',
  isPrivacyMode: false,
  isWidgetPrivacyEnabled: false,
  showAccountMonthlyStats: true,
  useCompactAccountPicker: false,
  advancedMode: false,
  themeId: ThemeIds.DEEP_SPACE,
  fontId: FontIds.DEEP_SPACE,
  hourCyclePreference: 'system',
  notificationCadence: 'none',
  notificationHour: 10,
  notificationMinute: 0,
  notificationWeekday: 1, // Monday
  defaultShareFormat: ShareFormat.TEXT,
  showSafeToSpendChart: true,
};

export const USER_PREFERENCE_KEYS = [
  'userName',
  'theme',
  'hourCyclePreference',
  'themeId',
  'fontId',
  'isPrivacyMode',
  'isWidgetPrivacyEnabled',
  'showAccountMonthlyStats',
  'useCompactAccountPicker',
  'advancedMode',
  'notificationCadence',
  'notificationHour',
  'notificationMinute',
  'notificationWeekday',
  'defaultShareFormat',
  'showSafeToSpendChart',
] as const;
export const PREFERENCES_KEY = 'full_frills_balance_ui_preferences';
export const USER_PREFERENCES_KEY = 'full_frills_balance_user_preferences';
export const PREFERENCE_SPLIT_MIGRATION_KEY = 'full_frills_balance_preference_split_v1';
export const LEGACY_PREFERENCE_KEYS = ['defaultCurrencyCode', 'defaultCurrency'] as const;
/** Dropped keys stripped on load so they leave MMKV. */
export const REMOVED_PREFERENCE_KEYS = [
  'isNativeAiEnabled',
  'preferredAiModelId',
  'aiInferenceMode',
  'archetype',
] as const;
