import { FontId, FontIds, ThemeId, ThemeIds } from '@/src/constants/design-tokens';
import { logger } from '@/src/utils/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFERENCES_KEY = 'full_frills_balance_ui_preferences';

interface UIPreferences {
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
  showAccountMonthlyStats: boolean;
  advancedMode: boolean;
}

class PreferencesHelper {
  private preferences: UIPreferences = {
    onboardingCompleted: false,
    userName: '',
    defaultCurrencyCode: 'USD',
    isPrivacyMode: false,
    showAccountMonthlyStats: true,
    advancedMode: false,
    themeId: ThemeIds.DEEP_SPACE, // Default to Deep Space
    fontId: FontIds.DEEP_SPACE, // Default to Deep Space
  };

  async loadPreferences(): Promise<UIPreferences> {
    try {
      const stored = await AsyncStorage.getItem(PREFERENCES_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (typeof parsed === 'object' && parsed !== null) {
            this.preferences = { ...this.preferences, ...parsed };
          }
        } catch (parseError) {
          logger.error('Failed to parse preferences, using defaults', { error: parseError });
        }
      }
    } catch (error) {
      logger.error('Failed to load preferences', { error });
    }
    return this.preferences;
  }

  async savePreferences(): Promise<void> {
    try {
      await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(this.preferences));
    } catch (error) {
      logger.error('Failed to save preferences', { error });
    }
  }

  get onboardingCompleted(): boolean {
    return this.preferences.onboardingCompleted;
  }

  async setOnboardingCompleted(completed: boolean): Promise<void> {
    this.preferences.onboardingCompleted = completed;
    await this.savePreferences();
  }

  get userName(): string | undefined {
    return this.preferences.userName;
  }

  async setUserName(name: string): Promise<void> {
    this.preferences.userName = name;
    await this.savePreferences();
  }

  get lastSelectedAccountId(): string | undefined {
    return this.preferences.lastSelectedAccountId;
  }

  async setLastSelectedAccountId(accountId: string | undefined): Promise<void> {
    this.preferences.lastSelectedAccountId = accountId;
    await this.savePreferences();
  }

  get lastDateRange(): { startDate: number; endDate: number } | undefined {
    return this.preferences.lastDateRange;
  }

  async setLastDateRange(range: { startDate: number; endDate: number } | undefined): Promise<void> {
    this.preferences.lastDateRange = range;
    await this.savePreferences();
  }

  get theme(): 'light' | 'dark' | 'system' | undefined {
    return this.preferences.theme;
  }

  async setTheme(theme: 'light' | 'dark' | 'system'): Promise<void> {
    this.preferences.theme = theme;
    await this.savePreferences();
  }

  get themeId(): ThemeId | undefined {
    return this.preferences.themeId;
  }

  async setThemeId(themeId: ThemeId): Promise<void> {
    this.preferences.themeId = themeId;
    await this.savePreferences();
  }

  get fontId(): FontId | undefined {
    return this.preferences.fontId;
  }

  async setFontId(fontId: FontId): Promise<void> {
    this.preferences.fontId = fontId;
    await this.savePreferences();
  }

  get defaultCurrencyCode(): string | undefined {
    return this.preferences.defaultCurrencyCode;
  }

  async setDefaultCurrencyCode(currencyCode: string): Promise<void> {
    this.preferences.defaultCurrencyCode = currencyCode;
    await this.savePreferences();
  }

  get lastUsedSourceAccountId(): string | undefined {
    return this.preferences.lastUsedSourceAccountId;
  }

  async setLastUsedSourceAccountId(accountId: string | undefined): Promise<void> {
    this.preferences.lastUsedSourceAccountId = accountId;
    await this.savePreferences();
  }

  get lastUsedDestinationAccountId(): string | undefined {
    return this.preferences.lastUsedDestinationAccountId;
  }

  async setLastUsedDestinationAccountId(accountId: string | undefined): Promise<void> {
    this.preferences.lastUsedDestinationAccountId = accountId;
    await this.savePreferences();
  }

  get isPrivacyMode(): boolean {
    return this.preferences.isPrivacyMode;
  }

  async setIsPrivacyMode(isPrivacyMode: boolean): Promise<void> {
    this.preferences.isPrivacyMode = isPrivacyMode;
    await this.savePreferences();
  }

  get showAccountMonthlyStats(): boolean {
    return this.preferences.showAccountMonthlyStats;
  }

  async setShowAccountMonthlyStats(show: boolean): Promise<void> {
    this.preferences.showAccountMonthlyStats = show;
    await this.savePreferences();
  }

  get advancedMode(): boolean {
    return this.preferences.advancedMode;
  }

  async setAdvancedMode(advancedMode: boolean): Promise<void> {
    this.preferences.advancedMode = advancedMode;
    await this.savePreferences();
  }

  // Clear all preferences (useful for testing or reset)
  async clearPreferences(): Promise<void> {
    this.preferences = {
      onboardingCompleted: false,
      isPrivacyMode: false,
      showAccountMonthlyStats: true,
      advancedMode: false,
    };
    try {
      await AsyncStorage.removeItem(PREFERENCES_KEY);
    } catch (error) {
      logger.warn('Failed to clear preferences', { error });
    }
  }
}

// Export singleton instance
export const preferences = new PreferencesHelper();
