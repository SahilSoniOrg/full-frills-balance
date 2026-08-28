import { PreferencesStore } from './PreferencesStore';
import { AiPreferences } from './domains/AiPreferences';
import { DashboardPreferences } from './domains/DashboardPreferences';
import { InsightPreferences } from './domains/InsightPreferences';
import { JournalNavigationPreferences } from './domains/JournalNavigationPreferences';
import { NotificationPreferences } from './domains/NotificationPreferences';
import { PrivacyPreferences } from './domains/PrivacyPreferences';
import { SmsPreferences } from './domains/SmsPreferences';
import { StsPreferences } from './domains/StsPreferences';
import { HourCyclePreferences } from './domains/HourCyclePreferences';
import { ThemePreferences } from './domains/ThemePreferences';

export type PreferencesFacade = PreferencesStore & {
  readonly themePrefs: ThemePreferences;
  readonly hourCycle: HourCyclePreferences;
  readonly privacy: PrivacyPreferences;
  readonly ai: AiPreferences;
  readonly sms: SmsPreferences;
  readonly sts: StsPreferences;
  readonly dashboard: DashboardPreferences;
  readonly notifications: NotificationPreferences;
  readonly insights: InsightPreferences;
  readonly journalNav: JournalNavigationPreferences;
};

/**
 * Build preferences façade: one PreferencesStore Implementation plus domain Interfaces.
 * Domain-covered keys are only on domain Modules; flat accessors remain for keys without domains.
 */
export function createPreferencesFacade(): PreferencesFacade {
  const store = new PreferencesStore();
  return Object.assign(store, {
    themePrefs: new ThemePreferences(store),
    hourCycle: new HourCyclePreferences(store),
    privacy: new PrivacyPreferences(store),
    ai: new AiPreferences(store),
    sms: new SmsPreferences(store),
    sts: new StsPreferences(store),
    dashboard: new DashboardPreferences(store),
    notifications: new NotificationPreferences(store),
    insights: new InsightPreferences(store),
    journalNav: new JournalNavigationPreferences(store),
  });
}
