import { useSyncExternalStore } from 'react';
import { createPreferencesFacade } from './PreferencesFacade';
import type { UIPreferences } from './types';

export type {
  AiPrefs,
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
export { InsightPreferences } from './domains/InsightPreferences';
export { JournalNavigationPreferences } from './domains/JournalNavigationPreferences';
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
    return (
      (preferences as any)._legacyData?.defaultCurrencyCode ||
      (preferences as any)._legacyData?.defaultCurrency
    );
  },
  clearLegacyCurrencyCode(): void {
    if ((preferences as any)._legacyData) {
      delete (preferences as any)._legacyData.defaultCurrencyCode;
      delete (preferences as any)._legacyData.defaultCurrency;
      (preferences as any)._save();
    }
  },
};

/**
 * React hook to observe UI preferences reactively.
 */
export function usePreferences(): UIPreferences {
  return useSyncExternalStore(
    onStoreChange => {
      const sub = preferences.observeAll().subscribe(() => onStoreChange());
      return () => sub.unsubscribe();
    },
    () => preferences.getPreferences(),
    () => preferences.getPreferences(),
  );
}
