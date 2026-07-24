import { FontId, FontIds, ThemeId, ThemeIds } from '@/src/constants/design-tokens';
import { AccountId, WorkplaceId } from '@/src/types/domain';
import { ShareFormat } from '@/src/types/sharing';
import { logger } from '@/src/utils/logger';
import { BehaviorSubject, Observable } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';
import { AppConfig } from '../constants/app-config';
import { migrateFromAsyncStorage, storage } from './storage';

const PREFERENCES_KEY = 'full_frills_balance_ui_preferences';

export interface UIPreferences {
  onboardingCompleted: boolean;
  userName?: string;
  lastSelectedAccountId?: AccountId;
  lastDateRange?: {
    startDate: number;
    endDate: number;
  };
  theme?: 'light' | 'dark' | 'system';
  themeId?: ThemeId;
  fontId?: FontId;
  lastUsedSourceAccountId?: AccountId;
  lastUsedDestinationAccountId?: AccountId;
  isPrivacyMode: boolean;
  isWidgetPrivacyEnabled: boolean;
  isAppLockEnabled: boolean;
  showAccountMonthlyStats: boolean;
  advancedMode: boolean;
  archetype?: string;
  dismissedPatternIds: string[];
  anonymizedId?: string;
  notificationCadence: 'none' | 'daily' | 'weekly';
  notificationHour: number;
  notificationMinute: number;
  notificationWeekday: number; // 1-7 (Mon-Sun)
  isSmsImportEnabled: boolean;
  isNativeAiEnabled: boolean;
  preferredAiModelId?: string;
  aiInferenceMode: 'single' | 'multi';
  defaultShareFormat?: ShareFormat;
  safeToSpendDays: number;
  activeWorkplaceId?: WorkplaceId;
}

const DEFAULT_UI_PREFERENCES: UIPreferences = {
  onboardingCompleted: false,
  userName: '',
  isPrivacyMode: false,
  isWidgetPrivacyEnabled: false,
  isAppLockEnabled: false,
  showAccountMonthlyStats: true,
  advancedMode: false,
  themeId: ThemeIds.DEEP_SPACE,
  fontId: FontIds.DEEP_SPACE,
  archetype: undefined,
  dismissedPatternIds: [],
  anonymizedId: undefined,
  notificationCadence: 'none',
  notificationHour: 10,
  notificationMinute: 0,
  notificationWeekday: 1, // Monday
  isSmsImportEnabled: false,
  isNativeAiEnabled: false,
  preferredAiModelId: AppConfig.defaults.defaultAiModelId,
  aiInferenceMode: 'multi',
  defaultShareFormat: ShareFormat.TEXT,
  safeToSpendDays: AppConfig.defaults.safeToSpendDays,
  activeWorkplaceId: undefined,
};

const LEGACY_PREFERENCE_KEYS = ['defaultCurrencyCode', 'defaultCurrency'] as const;

class PreferencesHelper {
  private preferences: UIPreferences = { ...DEFAULT_UI_PREFERENCES };
  private legacyData: Record<string, any> = {};
  private preferencesSubject = new BehaviorSubject<UIPreferences>(DEFAULT_UI_PREFERENCES);

  constructor() {
    this.reloadFromStorage();
  }

  observe<K extends keyof UIPreferences>(key: K): Observable<UIPreferences[K]> {
    return this.preferencesSubject.asObservable().pipe(
      map(p => p[key]),
      distinctUntilChanged(),
    );
  }

  private reloadFromStorage(): void {
    try {
      const stored = storage.getString(PREFERENCES_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (typeof parsed === 'object' && parsed !== null) {
            // Extract all legacy fields if present
            LEGACY_PREFERENCE_KEYS.forEach(key => {
              if (key in parsed) {
                this.legacyData[key] = parsed[key];
                delete parsed[key];
              }
            });

            this.preferences = { ...DEFAULT_UI_PREFERENCES, ...this.sanitizePreferences(parsed) };
            this.preferencesSubject.next(this.preferences);
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

    if (sanitized.theme && !['light', 'dark', 'system'].includes(sanitized.theme)) {
      delete sanitized.theme;
    }
    if (sanitized.themeId && !Object.values(ThemeIds).includes(sanitized.themeId)) {
      delete sanitized.themeId;
    }
    if (sanitized.fontId && !Object.values(FontIds).includes(sanitized.fontId)) {
      delete sanitized.fontId;
    }
    if (sanitized.dismissedPatternIds && !Array.isArray(sanitized.dismissedPatternIds)) {
      sanitized.dismissedPatternIds = [];
    }
    if (sanitized.safeToSpendDays && ![30, 60, 90].includes(sanitized.safeToSpendDays)) {
      // Allow 90 as well just in case, but user requested 30/60
      sanitized.safeToSpendDays = AppConfig.defaults.safeToSpendDays;
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

  private _loadPromise: Promise<UIPreferences> | null = null;

  /**
   * Initializes preferences. Performs one-time migration if needed.
   * Promise is cached so concurrent callers share the same in-flight migration
   * check and the storage layer is never hit twice during boot.
   */
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
      }
      return this.preferences;
    })();

    return this._loadPromise;
  }

  private updatePreferences(updates: Partial<UIPreferences>): void {
    this.preferences = { ...this.preferences, ...this.sanitizePreferences(updates) };
    this.preferencesSubject.next(this.preferences);
    this.savePreferences();
  }

  restorePreferences(data?: any): void {
    const currentActiveId = this.preferences.activeWorkplaceId;

    // Extract legacy fields from imported data
    if (data && typeof data === 'object') {
      LEGACY_PREFERENCE_KEYS.forEach(key => {
        if (key in data) {
          this.legacyData[key] = data[key];
        }
      });
    }

    this.preferences = {
      ...DEFAULT_UI_PREFERENCES,
      ...(data ? this.sanitizePreferences(data) : {}),
    };

    // Preserve activeWorkplaceId if it was already set and the new data doesn't have one.
    // This prevents the app from losing its workplace context during a settings restore.
    if (!this.preferences.activeWorkplaceId && currentActiveId) {
      this.preferences.activeWorkplaceId = currentActiveId;
    }

    this.savePreferences();
    this.preferencesSubject.next(this.preferences);
  }

  savePreferences(): void {
    try {
      const toStore = {
        ...this.preferences,
        ...this.legacyData,
      };
      storage.set(PREFERENCES_KEY, JSON.stringify(toStore));
    } catch (error) {
      logger.error('Failed to save preferences to MMKV', { error });
    }
  }

  get onboardingCompleted(): boolean {
    return this.preferences.onboardingCompleted;
  }

  setOnboardingCompleted(completed: boolean): void {
    this.updatePreferences({ onboardingCompleted: completed });
  }

  get userName(): string | undefined {
    return this.preferences.userName;
  }

  setUserName(name: string): void {
    this.updatePreferences({ userName: name });
  }

  // Internal accessors for migration only - DO NOT USE in application code
  /** @internal */
  get _legacyData(): Record<string, any> {
    return this.legacyData;
  }

  /** @internal */
  _save(): void {
    this.savePreferences();
  }

  get lastSelectedAccountId(): string | undefined {
    return this.preferences.lastSelectedAccountId;
  }

  setLastSelectedAccountId(accountId: AccountId | undefined): void {
    this.updatePreferences({ lastSelectedAccountId: accountId });
  }

  get lastDateRange(): { startDate: number; endDate: number } | undefined {
    return this.preferences.lastDateRange;
  }

  setLastDateRange(range: { startDate: number; endDate: number } | undefined): void {
    this.updatePreferences({ lastDateRange: range });
  }

  get theme(): 'light' | 'dark' | 'system' | undefined {
    return this.preferences.theme;
  }

  setTheme(theme: 'light' | 'dark' | 'system'): void {
    this.updatePreferences({ theme });
  }

  get themeId(): ThemeId | undefined {
    return this.preferences.themeId;
  }

  setThemeId(themeId: ThemeId): void {
    this.updatePreferences({ themeId });
  }

  get fontId(): FontId | undefined {
    return this.preferences.fontId;
  }

  setFontId(fontId: FontId): void {
    this.updatePreferences({ fontId });
  }

  get lastUsedSourceAccountId(): AccountId | undefined {
    return this.preferences.lastUsedSourceAccountId;
  }

  setLastUsedSourceAccountId(accountId: AccountId | undefined): void {
    this.updatePreferences({ lastUsedSourceAccountId: accountId });
  }

  get lastUsedDestinationAccountId(): AccountId | undefined {
    return this.preferences.lastUsedDestinationAccountId;
  }

  setLastUsedDestinationAccountId(accountId: AccountId | undefined): void {
    this.updatePreferences({ lastUsedDestinationAccountId: accountId });
  }

  get isPrivacyMode(): boolean {
    return this.preferences.isPrivacyMode;
  }

  setIsPrivacyMode(isPrivacyMode: boolean): void {
    this.updatePreferences({ isPrivacyMode });
  }

  get isWidgetPrivacyEnabled(): boolean {
    return this.preferences.isWidgetPrivacyEnabled;
  }

  setIsWidgetPrivacyEnabled(isEnabled: boolean): void {
    this.updatePreferences({ isWidgetPrivacyEnabled: isEnabled });
  }

  get isAppLockEnabled(): boolean {
    return this.preferences.isAppLockEnabled;
  }

  setAppLockEnabled(isAppLockEnabled: boolean): void {
    this.updatePreferences({ isAppLockEnabled });
  }

  get showAccountMonthlyStats(): boolean {
    return this.preferences.showAccountMonthlyStats;
  }

  setShowAccountMonthlyStats(show: boolean): void {
    this.updatePreferences({ showAccountMonthlyStats: show });
  }

  get advancedMode(): boolean {
    return this.preferences.advancedMode;
  }

  setAdvancedMode(advancedMode: boolean): void {
    this.updatePreferences({ advancedMode });
  }

  get archetype(): string | undefined {
    return this.preferences.archetype;
  }

  setArchetype(archetype: string): void {
    this.updatePreferences({ archetype });
  }

  get notificationCadence(): 'none' | 'daily' | 'weekly' {
    return this.preferences.notificationCadence || 'none';
  }

  setNotificationCadence(cadence: 'none' | 'daily' | 'weekly'): void {
    this.updatePreferences({ notificationCadence: cadence });
  }

  get notificationHour(): number {
    return this.preferences.notificationHour ?? 10;
  }

  setNotificationHour(hour: number): void {
    this.updatePreferences({ notificationHour: hour });
  }

  get notificationMinute(): number {
    return this.preferences.notificationMinute ?? 0;
  }

  setNotificationMinute(minute: number): void {
    this.updatePreferences({ notificationMinute: minute });
  }

  get notificationWeekday(): number {
    return this.preferences.notificationWeekday ?? 1;
  }

  setNotificationWeekday(weekday: number): void {
    this.updatePreferences({ notificationWeekday: weekday });
  }

  get isSmsImportEnabled(): boolean {
    return this.preferences.isSmsImportEnabled ?? false;
  }

  setIsSmsImportEnabled(enabled: boolean): void {
    this.updatePreferences({ isSmsImportEnabled: enabled });
  }

  get isNativeAiEnabled(): boolean {
    return this.preferences.isNativeAiEnabled ?? false;
  }

  setIsNativeAiEnabled(enabled: boolean): void {
    this.updatePreferences({ isNativeAiEnabled: enabled });
  }

  get preferredAiModelId(): string | undefined {
    return this.preferences.preferredAiModelId;
  }

  setPreferredAiModelId(modelId: string): void {
    this.updatePreferences({ preferredAiModelId: modelId });
  }

  get aiInferenceMode(): 'single' | 'multi' {
    return this.preferences.aiInferenceMode || 'multi';
  }

  setAiInferenceMode(mode: 'single' | 'multi'): void {
    this.updatePreferences({ aiInferenceMode: mode });
  }

  get defaultShareFormat(): ShareFormat {
    return this.preferences.defaultShareFormat || ShareFormat.TEXT;
  }

  setDefaultShareFormat(format: ShareFormat): void {
    this.updatePreferences({ defaultShareFormat: format });
  }

  get safeToSpendDays(): number {
    return this.preferences.safeToSpendDays ?? AppConfig.defaults.safeToSpendDays;
  }

  setSafeToSpendDays(days: number): void {
    this.updatePreferences({ safeToSpendDays: days });
  }

  get activeWorkplaceId(): WorkplaceId | undefined {
    return this.preferences.activeWorkplaceId;
  }

  setActiveWorkplaceId(workplaceId?: WorkplaceId): void {
    this.updatePreferences({ activeWorkplaceId: workplaceId });
  }

  get dismissedPatternIds(): string[] {
    return this.preferences.dismissedPatternIds;
  }

  get anonymizedId(): string | undefined {
    return this.preferences.anonymizedId;
  }

  setAnonymizedId(id: string): void {
    this.updatePreferences({ anonymizedId: id });
  }

  dismissPattern(id: string): void {
    const current = this.preferences.dismissedPatternIds;
    if (!current.includes(id)) {
      this.updatePreferences({
        dismissedPatternIds: [...current, id],
      });
    }
  }

  undismissPattern(id: string): void {
    const current = this.preferences.dismissedPatternIds;
    if (current.includes(id)) {
      this.updatePreferences({
        dismissedPatternIds: current.filter(pId => pId !== id),
      });
    }
  }

  // Clear all preferences (useful for testing or reset)
  clearPreferences(): void {
    this.preferences = { ...DEFAULT_UI_PREFERENCES };
    this.legacyData = {};
    this.preferencesSubject.next(this.preferences);
    try {
      storage.remove(PREFERENCES_KEY);
    } catch (error) {
      logger.warn('Failed to clear preferences from MMKV', { error });
    }
  }
}

// Export singleton instance
export const preferences = new PreferencesHelper();

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
