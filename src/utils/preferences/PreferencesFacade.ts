import { PreferencesStore } from './PreferencesStore';
import { AiPreferences } from './domains/AiPreferences';
import { InsightPreferences } from './domains/InsightPreferences';
import { NotificationPreferences } from './domains/NotificationPreferences';
import { PrivacyPreferences } from './domains/PrivacyPreferences';
import { SmsPreferences } from './domains/SmsPreferences';
import { StsPreferences } from './domains/StsPreferences';
import { JournalNavigationPreferences } from './domains/JournalNavigationPreferences';
import { ThemePreferences } from './domains/ThemePreferences';

export type PreferencesFacade = PreferencesStore & {
  /** Theme / typography domain Interface (flat `theme` / `themeId` getters remain). */
  readonly themePrefs: ThemePreferences;
  readonly privacy: PrivacyPreferences;
  readonly ai: AiPreferences;
  readonly sms: SmsPreferences;
  readonly sts: StsPreferences;
  readonly notifications: NotificationPreferences;
  readonly insights: InsightPreferences;
  readonly journalNav: JournalNavigationPreferences;
};

/**
 * Build preferences façade: one PreferencesStore Implementation plus domain Interfaces.
 * Flat getters/setters stay on the store for compatibility.
 */
export function createPreferencesFacade(): PreferencesFacade {
  const store = new PreferencesStore();
  return Object.assign(store, {
    themePrefs: new ThemePreferences(store),
    privacy: new PrivacyPreferences(store),
    ai: new AiPreferences(store),
    sms: new SmsPreferences(store),
    sts: new StsPreferences(store),
    notifications: new NotificationPreferences(store),
    insights: new InsightPreferences(store),
    journalNav: new JournalNavigationPreferences(store),
  });
}
