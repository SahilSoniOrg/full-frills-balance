import { AppConfig } from '@/src/constants';
import { FontId, FontIds, ThemeId, ThemeIds } from '@/src/constants/design-tokens';
import { ShareFormat } from '@/src/types/sharing';
import { logger } from '@/src/utils/logger';
import { storage, migrateFromAsyncStorage } from './storage';

const PREFERENCES_KEY = 'full_frills_balance_ui_preferences';

export interface UIPreferences {
  onboardingCompleted: boolean;
  userName?: string;
  defaultCurrencyCode?: string;
  lastSelectedAccountId?: string;
  lastDateRange?: {
    startDate: number;
    endDate: number;
  };
  theme?: 'light' | 'dark' | 'system';
  themeId?: ThemeId;
  fontId?: FontId;
  lastUsedSourceAccountId?: string;
  lastUsedDestinationAccountId?: string;
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
  defaultShareFormat?: ShareFormat;
}

const DEFAULT_UI_PREFERENCES: UIPreferences = {
  onboardingCompleted: false,
  userName: '',
  defaultCurrencyCode: AppConfig.defaultCurrency,
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
  defaultShareFormat: ShareFormat.TEXT,
};

class PreferencesHelper {
  private preferences: UIPreferences = { ...DEFAULT_UI_PREFERENCES };

  constructor() {
    this.reloadFromStorage();
  }

  private reloadFromStorage(): void {
    try {
      const stored = storage.getString(PREFERENCES_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (typeof parsed === 'object' && parsed !== null) {
            this.preferences = { ...DEFAULT_UI_PREFERENCES, ...this.sanitizePreferences(parsed) };
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

  /**
   * Initializes preferences. Performs one-time migration if needed.
   * This remains async primarily for the migration bridge.
   */
  async loadPreferences(): Promise<UIPreferences> {
    try {
      const migrated = await migrateFromAsyncStorage();
      if (migrated) {
        this.reloadFromStorage();
      }
    } catch (error) {
      logger.error('Failed to initialize preferences migration', { error });
    }
    return this.preferences;
  }

  private updatePreferences(updates: Partial<UIPreferences>): void {
    this.preferences = { ...this.preferences, ...this.sanitizePreferences(updates) };
    this.savePreferences();
  }

  restorePreferences(data?: Partial<UIPreferences>): void {
    this.preferences = {
      ...DEFAULT_UI_PREFERENCES,
      ...(data ? this.sanitizePreferences(data) : {}),
    };
    this.savePreferences();
  }

  savePreferences(): void {
    try {
      storage.set(PREFERENCES_KEY, JSON.stringify(this.preferences));
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

  get lastSelectedAccountId(): string | undefined {
    return this.preferences.lastSelectedAccountId;
  }

  setLastSelectedAccountId(accountId: string | undefined): void {
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

  get defaultCurrencyCode(): string | undefined {
    return this.preferences.defaultCurrencyCode;
  }

  setDefaultCurrencyCode(currencyCode: string): void {
    this.updatePreferences({ defaultCurrencyCode: currencyCode });
  }

  get lastUsedSourceAccountId(): string | undefined {
    return this.preferences.lastUsedSourceAccountId;
  }

  setLastUsedSourceAccountId(accountId: string | undefined): void {
    this.updatePreferences({ lastUsedSourceAccountId: accountId });
  }

  get lastUsedDestinationAccountId(): string | undefined {
    return this.preferences.lastUsedDestinationAccountId;
  }

  setLastUsedDestinationAccountId(accountId: string | undefined): void {
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

  get defaultShareFormat(): ShareFormat {
    return this.preferences.defaultShareFormat || ShareFormat.TEXT;
  }

  setDefaultShareFormat(format: ShareFormat): void {
    this.updatePreferences({ defaultShareFormat: format });
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
    try {
      storage.remove(PREFERENCES_KEY);
    } catch (error) {
      logger.warn('Failed to clear preferences from MMKV', { error });
    }
  }
}

// Export singleton instance
export const preferences = new PreferencesHelper();
