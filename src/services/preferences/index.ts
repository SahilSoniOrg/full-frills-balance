import { PreferencesFacadeStore } from './PreferencesFacade';

export type { PrivacyPolicyAcknowledgement, ThemeAppearance, UIPreferences } from './types';
export { DEFAULT_UI_PREFERENCES } from './types';

export const preferences = new PreferencesFacadeStore();

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
