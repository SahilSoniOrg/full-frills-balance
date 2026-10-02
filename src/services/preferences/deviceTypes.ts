import { WorkplaceId } from '@/src/types/ids';

/** State that belongs to this install and must not follow User or Workplace. */
export interface DevicePreferences {
  deviceRegistered: boolean;
  isAppLockEnabled: boolean;
  /** Telemetry distinct id. Prefix encodes install kind: anon_, dev_, preview_, e2e_, sim_. */
  anonymizedId?: string;
  activeWorkplaceId?: WorkplaceId;
  isSmsImportEnabled: boolean;
  /** Explicit opt-in for background reads of each arriving SMS. */
  isAutomaticSmsImportEnabled: boolean;
  /** Master switch for applying SMS rules that post entries without review. */
  isSmsAutoPostEnabled: boolean;
  areSmsReviewNotificationsEnabled: boolean;
  showSmsNotificationDetails: boolean;
  /** In-app reduce-motion for this install (ORs with system AccessibilityInfo). */
  reduceMotion: boolean;
}

export const DEFAULT_DEVICE_PREFERENCES: DevicePreferences = {
  deviceRegistered: false,
  isAppLockEnabled: false,
  anonymizedId: undefined,
  activeWorkplaceId: undefined,
  isSmsImportEnabled: false,
  isAutomaticSmsImportEnabled: false,
  isSmsAutoPostEnabled: true,
  areSmsReviewNotificationsEnabled: true,
  showSmsNotificationDetails: false,
  reduceMotion: false,
};

export const DEVICE_PREFERENCE_KEYS = [
  'deviceRegistered',
  'isAppLockEnabled',
  'anonymizedId',
  'activeWorkplaceId',
  'isSmsImportEnabled',
  'isAutomaticSmsImportEnabled',
  'isSmsAutoPostEnabled',
  'areSmsReviewNotificationsEnabled',
  'showSmsNotificationDetails',
  'reduceMotion',
] as const;

export type DevicePreferenceKey = (typeof DEVICE_PREFERENCE_KEYS)[number];

export const DEVICE_PREFERENCES_KEY = 'full_frills_balance_device_preferences';
