import { FontIds, ThemeIds } from '@/src/constants/design-tokens';
import { ShareFormat } from '@/src/types/sharing';
import { logger } from '@/src/utils/logger';
import { BehaviorSubject, Observable } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';
import { isHourCyclePreference } from '@/src/utils/hourCycle';
import { migrateFromAsyncStorage, storage } from '@/src/utils/storage';
import { splitPreferenceBags } from './splitPreferenceBags';
import {
  DEFAULT_UI_PREFERENCES,
  LEGACY_PREFERENCE_KEYS,
  PREFERENCES_KEY,
  REMOVED_PREFERENCE_KEYS,
  UIPreferences,
  USER_PREFERENCES_KEY,
} from './types';

/**
 * User-bag MMKV store. Device and Workplace bags live in their own stores.
 */
export class PreferencesStore {
  private preferences: UIPreferences = { ...DEFAULT_UI_PREFERENCES };
  private legacyData: Record<string, unknown> = {};
  private preferencesSubject = new BehaviorSubject<UIPreferences>(DEFAULT_UI_PREFERENCES);
  private _loadPromise: Promise<UIPreferences> | null = null;

  constructor() {
    this.reloadFromStorage();
  }

  getSnapshot(): UIPreferences {
    return this.preferences;
  }

  observe<K extends keyof UIPreferences>(key: K): Observable<UIPreferences[K]> {
    return this.preferencesSubject.asObservable().pipe(
      map(p => p[key]),
      distinctUntilChanged(),
    );
  }

  update(updates: Partial<UIPreferences>): void {
    this.preferences = { ...this.preferences, ...this.sanitizePreferences(updates) };
    this.preferencesSubject.next(this.preferences);
    this.savePreferences();
  }

  protected reloadFromStorage(): void {
    try {
      const stored = storage.getString(USER_PREFERENCES_KEY) ?? storage.getString(PREFERENCES_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (typeof parsed === 'object' && parsed !== null) {
            LEGACY_PREFERENCE_KEYS.forEach(key => {
              if (key in parsed) {
                this.legacyData[key] = parsed[key];
                delete parsed[key];
              }
            });

            const { user } = splitPreferenceBags(parsed);
            const hadRemovedKeys = REMOVED_PREFERENCE_KEYS.some(key => key in parsed);
            this.preferences = { ...DEFAULT_UI_PREFERENCES, ...this.sanitizePreferences(user) };
            this.preferencesSubject.next(this.preferences);
            if (hadRemovedKeys) {
              this.savePreferences();
            }
          }
        } catch (parseError) {
          logger.error('Failed to parse preferences, using defaults', { error: parseError });
        }
      }
    } catch (error) {
      logger.error('Failed to reload preferences from MMKV', { error });
    }
  }

  private sanitizePreferences(input: Partial<UIPreferences>): Partial<UIPreferences> {
    const sanitized: Partial<UIPreferences> = { ...input };
    const stale = sanitized as Record<string, unknown>;
    for (const key of REMOVED_PREFERENCE_KEYS) {
      delete stale[key];
    }

    if (sanitized.theme && !['light', 'dark', 'system'].includes(sanitized.theme)) {
      delete sanitized.theme;
    }
    if (
      sanitized.hourCyclePreference !== undefined &&
      !isHourCyclePreference(sanitized.hourCyclePreference)
    ) {
      delete sanitized.hourCyclePreference;
    }
    if (sanitized.themeId && !Object.values(ThemeIds).includes(sanitized.themeId)) {
      delete sanitized.themeId;
    }
    if (sanitized.fontId && !Object.values(FontIds).includes(sanitized.fontId)) {
      delete sanitized.fontId;
    }
    if (
      sanitized.notificationCadence &&
      !['none', 'daily', 'weekly'].includes(sanitized.notificationCadence)
    ) {
      delete sanitized.notificationCadence;
    }
    if (
      sanitized.defaultShareFormat &&
      !Object.values(ShareFormat).includes(sanitized.defaultShareFormat)
    ) {
      delete sanitized.defaultShareFormat;
    }
    if (
      sanitized.notificationHour !== undefined &&
      (typeof sanitized.notificationHour !== 'number' ||
        sanitized.notificationHour < 0 ||
        sanitized.notificationHour > 23)
    ) {
      delete sanitized.notificationHour;
    }
    if (
      sanitized.notificationMinute !== undefined &&
      (typeof sanitized.notificationMinute !== 'number' ||
        sanitized.notificationMinute < 0 ||
        sanitized.notificationMinute > 59)
    ) {
      delete sanitized.notificationMinute;
    }
    if (
      sanitized.notificationWeekday !== undefined &&
      (typeof sanitized.notificationWeekday !== 'number' ||
        sanitized.notificationWeekday < 1 ||
        sanitized.notificationWeekday > 7)
    ) {
      delete sanitized.notificationWeekday;
    }

    return sanitized;
  }

  async loadPreferences(): Promise<UIPreferences> {
    if (this._loadPromise) return this._loadPromise;

    this._loadPromise = (async () => {
      try {
        const migrated = await migrateFromAsyncStorage();
        if (migrated) {
          this.reloadFromStorage();
        }
      } catch (error) {
        logger.error('Failed to initialize preferences migration', { error });
        throw error;
      }
      return this.preferences;
    })();

    return this._loadPromise;
  }

  restorePreferences(data?: unknown): void {
    const { user, legacyCurrency } = splitPreferenceBags(data);

    for (const [key, value] of Object.entries(legacyCurrency)) {
      this.legacyData[key] = value;
    }

    this.preferences = {
      ...DEFAULT_UI_PREFERENCES,
      ...this.sanitizePreferences(user),
    };

    this.savePreferences();
    this.preferencesSubject.next(this.preferences);
  }

  savePreferences(): void {
    try {
      const toStore = {
        ...this.preferences,
        ...this.legacyData,
      };
      storage.set(USER_PREFERENCES_KEY, JSON.stringify(toStore));
    } catch (error) {
      logger.error('Failed to save preferences to MMKV', { error });
    }
  }

  get userName(): string | undefined {
    return this.preferences.userName;
  }

  setUserName(name: string): void {
    this.update({ userName: name });
  }

  /**
   * Legacy currency fields stripped from UIPreferences into side storage.
   * Used only by WorkplaceService migration.
   */
  getLegacyCurrencyCode(): string | undefined {
    const code = this.legacyData.defaultCurrencyCode ?? this.legacyData.defaultCurrency;
    return typeof code === 'string' ? code : undefined;
  }

  clearLegacyCurrencyFields(): void {
    delete this.legacyData.defaultCurrencyCode;
    delete this.legacyData.defaultCurrency;
    this.savePreferences();
  }

  get showAccountMonthlyStats(): boolean {
    return this.preferences.showAccountMonthlyStats;
  }

  setShowAccountMonthlyStats(show: boolean): void {
    this.update({ showAccountMonthlyStats: show });
  }

  get useCompactAccountPicker(): boolean {
    return this.preferences.useCompactAccountPicker;
  }

  setUseCompactAccountPicker(useCompactAccountPicker: boolean): void {
    this.update({ useCompactAccountPicker });
  }

  get advancedMode(): boolean {
    return this.preferences.advancedMode;
  }

  setAdvancedMode(advancedMode: boolean): void {
    this.update({ advancedMode });
  }

  get defaultShareFormat(): ShareFormat {
    return this.preferences.defaultShareFormat || ShareFormat.TEXT;
  }

  setDefaultShareFormat(format: ShareFormat): void {
    this.update({ defaultShareFormat: format });
  }

  clearPreferences(): void {
    this.preferences = { ...DEFAULT_UI_PREFERENCES };
    this.legacyData = {};
    this.preferencesSubject.next(this.preferences);
    try {
      storage.remove(USER_PREFERENCES_KEY);
      storage.remove(PREFERENCES_KEY);
    } catch (error) {
      logger.warn('Failed to clear preferences from MMKV', { error });
    }
  }
}
