import type { FontId, ThemeId } from '@/src/constants/design-tokens';
import type { ShareFormat } from '@/src/types/sharing';
import type { HourCyclePreference } from '@/src/utils/hourCycle';

/** Chrome and identity that follow the person across workplaces. */
export interface PrivacyPolicyAcknowledgement {
  version: string;
  acknowledgedAt: string;
}

/**
 * Persisted user-preference snapshot.
 *
 * Runtime callers should use the scoped preference stores instead of treating
 * this aggregate shape as a domain API.
 */
export interface UIPreferences {
  userName?: string;
  theme?: 'light' | 'dark' | 'system';
  hourCyclePreference?: HourCyclePreference;
  themeId?: ThemeId;
  fontId?: FontId;
  isPrivacyMode: boolean;
  isWidgetPrivacyEnabled: boolean;
  privacyPolicyAcknowledgement?: PrivacyPolicyAcknowledgement;
  showAccountMonthlyStats: boolean;
  useCompactAccountPicker: boolean;
  advancedMode: boolean;
  notificationCadence: 'none' | 'daily' | 'weekly';
  notificationHour: number;
  notificationMinute: number;
  notificationWeekday: number;
  defaultShareFormat?: ShareFormat;
  showSafeToSpendChart: boolean;
}

export type ThemeAppearance = 'light' | 'dark' | 'system';
