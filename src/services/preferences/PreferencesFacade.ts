import { PreferencesStore } from './PreferencesStore';
import { DevicePreferencesStore } from './DevicePreferencesStore';
import { WorkplacePreferencesStore } from './WorkplacePreferencesStore';
import { DashboardPreferences } from './domains/DashboardPreferences';
import { InsightPreferences } from './domains/InsightPreferences';
import { JournalNavigationPreferences } from './domains/JournalNavigationPreferences';
import { NotificationPreferences } from './domains/NotificationPreferences';
import { PrivacyPreferences } from './domains/PrivacyPreferences';
import { SmsPreferences } from './domains/SmsPreferences';
import { StsPreferences } from './domains/StsPreferences';
import { HourCyclePreferences } from './domains/HourCyclePreferences';
import { ThemePreferences } from './domains/ThemePreferences';
import {
  hasRawDeviceBag,
  isPreferenceSplitMigrationComplete,
  migrateLegacyPreferencesIfNeeded,
} from './migrateLegacyPreferences';
import { splitPreferenceBags } from './splitPreferenceBags';
import { WorkplaceId } from '@/src/types/ids';
import { UIPreferences } from './types';

export type PreferencesFacade = PreferencesStore & {
  readonly device: DevicePreferencesStore;
  readonly workplace: WorkplacePreferencesStore;
  readonly themePrefs: ThemePreferences;
  readonly hourCycle: HourCyclePreferences;
  readonly privacy: PrivacyPreferences;
  readonly sms: SmsPreferences;
  readonly sts: StsPreferences;
  readonly dashboard: DashboardPreferences;
  readonly notifications: NotificationPreferences;
  readonly insights: InsightPreferences;
  readonly journalNav: JournalNavigationPreferences;
  /** Raw Device-bag presence captured before legacy migration runs at startup. */
  readonly rawDeviceBagPresentAtStartup: boolean;
  restoreImportedPreferences: (
    data: unknown,
    workplaceId: WorkplaceId,
    scope?: 'all' | 'workplace',
  ) => void;
};

class PreferencesFacadeStore extends PreferencesStore implements PreferencesFacade {
  readonly device: DevicePreferencesStore;
  readonly workplace: WorkplacePreferencesStore;
  readonly themePrefs: ThemePreferences;
  readonly hourCycle: HourCyclePreferences;
  readonly privacy: PrivacyPreferences;
  readonly sms: SmsPreferences;
  readonly sts: StsPreferences;
  readonly dashboard: DashboardPreferences;
  readonly notifications: NotificationPreferences;
  readonly insights: InsightPreferences;
  readonly journalNav: JournalNavigationPreferences;
  rawDeviceBagPresentAtStartup = false;
  private _initializePromise: Promise<UIPreferences> | null = null;

  constructor() {
    super();

    this.device = new DevicePreferencesStore();
    this.workplace = new WorkplacePreferencesStore();
    this.themePrefs = new ThemePreferences(this);
    this.hourCycle = new HourCyclePreferences(this);
    this.privacy = new PrivacyPreferences(this, this.device);
    this.sms = new SmsPreferences(this.device);
    this.sts = new StsPreferences(this.workplace, this.device);
    this.dashboard = new DashboardPreferences(this);
    this.notifications = new NotificationPreferences(this);
    this.insights = new InsightPreferences(this.workplace);
    this.journalNav = new JournalNavigationPreferences(this.workplace, this.device);
  }

  restoreImportedPreferences(
    data: unknown,
    workplaceId: WorkplaceId,
    scope: 'all' | 'workplace' = 'all',
  ): void {
    const { user: userPatch, workplace: workplacePatch } = splitPreferenceBags(data);
    if (scope === 'all') {
      const importedName = userPatch.userName?.trim();
      this.restorePreferences({
        ...userPatch,
        userName: importedName || this.userName?.trim() || 'User',
      });
    }
    this.workplace.replace(workplaceId, workplacePatch);
  }

  override async loadPreferences(): Promise<UIPreferences> {
    if (this._initializePromise) return this._initializePromise;

    this._initializePromise = (async () => {
      await super.loadPreferences();
      this.rawDeviceBagPresentAtStartup = hasRawDeviceBag();
      migrateLegacyPreferencesIfNeeded();
      if (!isPreferenceSplitMigrationComplete()) {
        throw new Error('Preference tenancy migration did not complete');
      }
      this.reloadFromStorage();
      this.device.reload();
      return this.getSnapshot();
    })().catch(error => {
      this._initializePromise = null;
      throw error;
    });

    return this._initializePromise;
  }

  override clearPreferences(): void {
    super.clearPreferences();
    this.device.clear();
    this.workplace.clear();
  }
}

/**
 * Build the preference façade: shared stores plus the remaining domain modules.
 */
export function createPreferencesFacade(): PreferencesFacade {
  return new PreferencesFacadeStore();
}
