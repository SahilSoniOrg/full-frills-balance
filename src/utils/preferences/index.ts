import { createPreferencesFacade } from './PreferencesFacade';

export type {
  AiPrefs,
  DashboardPrefs,
  NotificationPrefs,
  PrivacyPrefs,
  SmsPrefs,
  StsPrefs,
  ThemeAppearance,
  ThemePrefs,
  UIPreferences,
} from './types';

export { PreferencesStore } from './PreferencesStore';
export { createPreferencesFacade } from './PreferencesFacade';
export type { PreferencesFacade } from './PreferencesFacade';
export { AiPreferences } from './domains/AiPreferences';
export { DashboardPreferences } from './domains/DashboardPreferences';
export { InsightPreferences } from './domains/InsightPreferences';
export { JournalNavigationPreferences } from './domains/JournalNavigationPreferences';
export { NotificationPreferences } from './domains/NotificationPreferences';
export type { NotificationCadence } from './domains/NotificationPreferences';
export { PrivacyPreferences } from './domains/PrivacyPreferences';
export { SmsPreferences } from './domains/SmsPreferences';
export { StsPreferences } from './domains/StsPreferences';
export { ThemePreferences } from './domains/ThemePreferences';

export const preferences = createPreferencesFacade();

/**
 * Specialized accessor for legacy preference migration.
 * Only use this in migration services (e.g. WorkplaceService).
 */
export const preferencesMigration = {
  get legacyCurrencyCode(): string | undefined {
    return preferences.getLegacyCurrencyCode();
  },
  clearLegacyCurrencyCode(): void {
    preferences.clearLegacyCurrencyFields();
  },
};
