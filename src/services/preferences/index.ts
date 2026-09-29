import { createPreferencesFacade } from './PreferencesFacade';

export type { PrivacyPolicyAcknowledgement, ThemeAppearance, UIPreferences } from './types';
export type { PrivacyPrefs } from './domains/PrivacyPreferences';
export type { DevicePreferences } from './deviceTypes';
export type { WorkplacePreferences } from './workplaceTypes';

export { PreferencesStore } from './PreferencesStore';
export { createPreferencesFacade } from './PreferencesFacade';
export type { PreferencesFacade } from './PreferencesFacade';
export { InsightPreferences } from './domains/InsightPreferences';
export { JournalNavigationPreferences } from './domains/JournalNavigationPreferences';
export { PrivacyPreferences } from './domains/PrivacyPreferences';
export { StsPreferences } from './domains/StsPreferences';
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
