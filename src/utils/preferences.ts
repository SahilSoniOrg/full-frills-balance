import { AppConfig } from '@/src/constants';
import { FontId, FontIds, ThemeId, ThemeIds } from '@/src/constants/design-tokens';
import { logger } from '@/src/utils/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  showAccountMonthlyStats: boolean;
  advancedMode: boolean;
  archetype?: string;
  dismissedPatternIds: string[];
}

const DEFAULT_UI_PREFERENCES: UIPreferences = {
  onboardingCompleted: false,
  userName: '',
  defaultCurrencyCode: AppConfig.defaultCurrency,
  isPrivacyMode: false,
  showAccountMonthlyStats: true,
  advancedMode: false,
  themeId: ThemeIds.DEEP_SPACE,
  fontId: FontIds.DEEP_SPACE,
  archetype: undefined,
  dismissedPatternIds: [],
};

class PreferencesHelper {
  private preferences: UIPreferences = { ...DEFAULT_UI_PREFERENCES };

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

    return sanitized;
  }

  async loadPreferences(): Promise<UIPreferences> {
    try {
      const stored = await AsyncStorage.getItem(PREFERENCES_KEY);
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
      logger.error('Failed to load preferences', { error });
    }
    return this.preferences;
  }

  private async updatePreferences(updates: Partial<UIPreferences>): Promise<void> {
    this.preferences = { ...this.preferences, ...this.sanitizePreferences(updates) };
    await this.savePreferences();
  }

  async restorePreferences(data?: Partial<UIPreferences>): Promise<void> {
    this.preferences = {
      ...DEFAULT_UI_PREFERENCES,
      ...(data ? this.sanitizePreferences(data) : {}),
    };
    await this.savePreferences();
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
    await this.updatePreferences({ onboardingCompleted: completed });
  }

  get userName(): string | undefined {
    return this.preferences.userName;
  }

  async setUserName(name: string): Promise<void> {
    await this.updatePreferences({ userName: name });
  }

  get lastSelectedAccountId(): string | undefined {
    return this.preferences.lastSelectedAccountId;
  }

  async setLastSelectedAccountId(accountId: string | undefined): Promise<void> {
    await this.updatePreferences({ lastSelectedAccountId: accountId });
  }

  get lastDateRange(): { startDate: number; endDate: number } | undefined {
    return this.preferences.lastDateRange;
  }

  async setLastDateRange(range: { startDate: number; endDate: number } | undefined): Promise<void> {
    await this.updatePreferences({ lastDateRange: range });
  }

  get theme(): 'light' | 'dark' | 'system' | undefined {
    return this.preferences.theme;
  }

  async setTheme(theme: 'light' | 'dark' | 'system'): Promise<void> {
    await this.updatePreferences({ theme });
  }

  get themeId(): ThemeId | undefined {
    return this.preferences.themeId;
  }

  async setThemeId(themeId: ThemeId): Promise<void> {
    await this.updatePreferences({ themeId });
  }

  get fontId(): FontId | undefined {
    return this.preferences.fontId;
  }

  async setFontId(fontId: FontId): Promise<void> {
    await this.updatePreferences({ fontId });
  }

  get defaultCurrencyCode(): string | undefined {
    return this.preferences.defaultCurrencyCode;
  }

  async setDefaultCurrencyCode(currencyCode: string): Promise<void> {
    await this.updatePreferences({ defaultCurrencyCode: currencyCode });
  }

  get lastUsedSourceAccountId(): string | undefined {
    return this.preferences.lastUsedSourceAccountId;
  }

  async setLastUsedSourceAccountId(accountId: string | undefined): Promise<void> {
    await this.updatePreferences({ lastUsedSourceAccountId: accountId });
  }

  get lastUsedDestinationAccountId(): string | undefined {
    return this.preferences.lastUsedDestinationAccountId;
  }

  async setLastUsedDestinationAccountId(accountId: string | undefined): Promise<void> {
    await this.updatePreferences({ lastUsedDestinationAccountId: accountId });
  }

  get isPrivacyMode(): boolean {
    return this.preferences.isPrivacyMode;
  }

  async setIsPrivacyMode(isPrivacyMode: boolean): Promise<void> {
    await this.updatePreferences({ isPrivacyMode });
  }

  get showAccountMonthlyStats(): boolean {
    return this.preferences.showAccountMonthlyStats;
  }

  async setShowAccountMonthlyStats(show: boolean): Promise<void> {
    await this.updatePreferences({ showAccountMonthlyStats: show });
  }

  get advancedMode(): boolean {
    return this.preferences.advancedMode;
  }

  async setAdvancedMode(advancedMode: boolean): Promise<void> {
    await this.updatePreferences({ advancedMode });
  }

  get archetype(): string | undefined {
    return this.preferences.archetype;
  }

  async setArchetype(archetype: string): Promise<void> {
    await this.updatePreferences({ archetype });
  }

  get dismissedPatternIds(): string[] {
    return this.preferences.dismissedPatternIds;
  }

  async dismissPattern(id: string): Promise<void> {
    const current = this.preferences.dismissedPatternIds;
    if (!current.includes(id)) {
      await this.updatePreferences({
        dismissedPatternIds: [...current, id],
      });
    }
  }

  async undismissPattern(id: string): Promise<void> {
    const current = this.preferences.dismissedPatternIds;
    if (current.includes(id)) {
      await this.updatePreferences({
        dismissedPatternIds: current.filter(pId => pId !== id),
      });
    }
  }

  // Clear all preferences (useful for testing or reset)
  async clearPreferences(): Promise<void> {
    this.preferences = { ...DEFAULT_UI_PREFERENCES };
    try {
      await AsyncStorage.removeItem(PREFERENCES_KEY);
    } catch (error) {
      logger.warn('Failed to clear preferences', { error });
    }
  }
}

// Export singleton instance
export const preferences = new PreferencesHelper();
