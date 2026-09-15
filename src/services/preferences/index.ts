import { createPreferencesFacade } from './PreferencesFacade';

export type { PrivacyPolicyAcknowledgement, ThemeAppearance, UIPreferences } from './types';
export type { DashboardPrefs } from './domains/DashboardPreferences';
export type { NotificationPrefs } from './domains/NotificationPreferences';
export type { PrivacyPrefs } from './domains/PrivacyPreferences';
export type { SmsPrefs } from './domains/SmsPreferences';
export type { ThemePrefs } from './domains/ThemePreferences';
export type { DevicePreferences } from './deviceTypes';
export type { WorkplacePreferences } from './workplaceTypes';

export { PreferencesStore } from './PreferencesStore';
export { createPreferencesFacade } from './PreferencesFacade';
export type { PreferencesFacade } from './PreferencesFacade';
export { DashboardPreferences } from './domains/DashboardPreferences';
export { InsightPreferences } from './domains/InsightPreferences';
export { JournalNavigationPreferences } from './domains/JournalNavigationPreferences';
export { NotificationPreferences } from './domains/NotificationPreferences';
export type { NotificationCadence } from './domains/NotificationPreferences';
export { PrivacyPreferences } from './domains/PrivacyPreferences';
export { SmsPreferences } from './domains/SmsPreferences';
export { StsPreferences } from './domains/StsPreferences';
export { ThemePreferences } from './domains/ThemePreferences';
export { HourCyclePreferences } from './domains/HourCyclePreferences';

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
