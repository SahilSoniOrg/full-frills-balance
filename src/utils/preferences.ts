import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFERENCES_KEY = 'full_frills_balance_ui_preferences';

interface UIPreferences {
  onboardingCompleted: boolean;
  lastSelectedAccountId?: string;
  lastDateRange?: {
    startDate: number;
    endDate: number;
  };
  theme?: 'light' | 'dark' | 'system';
  defaultCurrencyCode?: string;
  lastUsedSourceAccountId?: string;
  lastUsedDestinationAccountId?: string;
}

class PreferencesHelper {
  private preferences: UIPreferences = {
    onboardingCompleted: false,
  };

  async loadPreferences(): Promise<UIPreferences> {
    try {
      const stored = await AsyncStorage.getItem(PREFERENCES_KEY);
      if (stored) {
        this.preferences = { ...this.preferences, ...JSON.parse(stored) };
      }
    } catch (error) {
      // Silently fail - preferences are optional
      console.warn('Failed to load preferences:', error);
    }
    return this.preferences;
  }

  async savePreferences(): Promise<void> {
    try {
      await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(this.preferences));
    } catch (error) {
      // Silently fail - preferences are optional
      console.warn('Failed to save preferences:', error);
    }
  }

  get onboardingCompleted(): boolean {
    return this.preferences.onboardingCompleted;
  }

  async setOnboardingCompleted(completed: boolean): Promise<void> {
    this.preferences.onboardingCompleted = completed;
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

  // Clear all preferences (useful for testing or reset)
  async clearPreferences(): Promise<void> {
    this.preferences = { onboardingCompleted: false };
    try {
      await AsyncStorage.removeItem(PREFERENCES_KEY);
    } catch (error) {
      console.warn('Failed to clear preferences:', error);
    }
  }
}

// Export singleton instance
export const preferences = new PreferencesHelper();
