/**
 * UI Context - Simple UI state management
 *
 * ========================================
 * HARD RULES FOR THIS CONTEXT:
 * ========================================
 * - MAY contain: onboarding flags, theme preference, simple UI state
 * - MAY NOT contain: domain data, business logic, derived values, repository calls
 * - If it needs persistence → preferences Module (`src/utils/preferences`)
 * - If it needs logic → repository
 * - If it needs data → database
 * ========================================
 */

import { AppConfig } from '@/src/constants/app-config';
import { FontId, FontIds, ThemeId, ThemeIds, ThemeMode } from '@/src/constants/design-tokens';
import { analytics } from '@/src/services/analytics-service';
import { ShareFormat } from '@/src/types/sharing';
import { logger } from '@/src/utils/logger';
import { preferences, usePreferences } from '@/src/utils/preferences';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

export interface ImportStats {
  accounts: number;
  journals: number;
  transactions: number;
  budgets?: number;
  auditLogs?: number;
  plannedPayments?: number;
  skippedTransactions: number;
  skippedItems?: { id: string; reason: string; description?: string }[];
}

export interface RestartOptions {
  type: 'IMPORT' | 'RESET' | 'SEED_MOCK';
  stats?: ImportStats;
}

/** Session-only / boot state — not persisted in preferences. */
interface UISessionState {
  isLoading: boolean;
  isInitialized: boolean;
  isUnlocked: boolean;
  hasUnlockedThisSession: boolean;
  isAppActive: boolean;
  isLockAuthenticating: boolean;
  fontsReady: boolean;
  loadedFontId: FontId | null;
  isRestartRequired: boolean;
  restartType: 'IMPORT' | 'RESET' | 'SEED_MOCK' | null;
  importStats: ImportStats | null;
  isDataHydrated: boolean;
}

// Simple UI state only - no domain data
interface UIState extends UISessionState {
  // Onboarding state
  hasCompletedOnboarding: boolean;

  // Theme preference
  themePreference: 'light' | 'dark' | 'system';
  themeId: ThemeId;
  fontId: FontId;

  // User details
  userName: string;

  // Privacy
  isPrivacyMode: boolean;
  isWidgetPrivacyEnabled: boolean;
  isAppLockEnabled: boolean;

  // Account Display
  showAccountMonthlyStats: boolean;

  // Advanced Mode
  advancedMode: boolean;

  archetype: string;
  notificationCadence: 'none' | 'daily' | 'weekly';
  notificationHour: number;
  notificationMinute: number;
  notificationWeekday: number;
  defaultShareFormat: ShareFormat;
  safeToSpendDays: number;
  isSmsImportEnabled: boolean;
  isNativeAiEnabled: boolean;
  preferredAiModelId: string;
  aiInferenceMode: 'single' | 'multi';
}
interface UIContextType extends UIState {
  // Computed values
  themeMode: 'light' | 'dark';
  isAppCurrentlyLocked: boolean; // BULLETPROOF: blocking logic unified for UI and services
  isAppReady: boolean; // Ready to show UI shell (Prefs + Fonts)

  // Setters for boot process
  setFontsReady: (ready: boolean, fontId?: FontId) => void;
  setDataHydrated: (hydrated: boolean) => void;

  // Actions for UI state only
  completeOnboarding: (name: string, archetype?: string) => Promise<void>;
  setThemePreference: (theme: 'light' | 'dark' | 'system') => Promise<void>;
  setThemeId: (themeId: ThemeId) => Promise<void>;
  setFontId: (fontId: FontId) => Promise<void>;
  updateUserDetails: (name: string, archetype?: string) => Promise<void>;
  setPrivacyMode: (isPrivacyMode: boolean) => Promise<void>;
  setWidgetPrivacyEnabled: (enabled: boolean) => Promise<void>;
  setAppLockEnabled: (enabled: boolean) => Promise<void>;
  authenticateSession: (unlocked: boolean) => void;
  setIsAppActive: (isActive: boolean) => void;
  setIsLockAuthenticating: (isAuthenticating: boolean) => void;
  setShowAccountMonthlyStats: (show: boolean) => Promise<void>;
  setArchetype: (archetype: string) => Promise<void>;
  setAdvancedMode: (advancedMode: boolean) => Promise<void>;
  setNotificationCadence: (cadence: 'none' | 'daily' | 'weekly') => Promise<void>;
  setNotificationTime: (hour: number, minute: number) => Promise<void>;
  setNotificationWeekday: (weekday: number) => Promise<void>;
  setDefaultShareFormat: (format: ShareFormat) => void;
  setSafeToSpendDays: (days: number) => Promise<void>;
  setIsSmsImportEnabled: (enabled: boolean) => Promise<void>;
  setIsNativeAiEnabled: (enabled: boolean) => Promise<void>;
  setPreferredAiModelId: (modelId: string) => Promise<void>;
  setAiInferenceMode: (mode: 'single' | 'multi') => Promise<void>;
  requireRestart: (options: RestartOptions) => void;
}
export const UIContext = createContext<UIContextType | undefined>(undefined);

// Support for local theme overrides (e.g. Design Preview)
const ThemeOverrideContext = createContext<ThemeMode | null>(null);

export function ThemeOverride({ mode, children }: { mode?: ThemeMode; children: React.ReactNode }) {
  return (
    <ThemeOverrideContext.Provider value={mode ?? null}>{children}</ThemeOverrideContext.Provider>
  );
}

export function useThemeOverride() {
  return useContext(ThemeOverrideContext);
}

const INITIAL_SESSION: UISessionState = {
  isLoading: false,
  isInitialized: false,
  isUnlocked: false,
  hasUnlockedThisSession: false,
  isAppActive: true,
  isLockAuthenticating: false,
  fontsReady: false,
  loadedFontId: null,
  isRestartRequired: false,
  restartType: null,
  importStats: null,
  isDataHydrated: false,
};

export function UIProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useColorScheme();
  const prefs = usePreferences();

  const [session, setSession] = useState<UISessionState>(INITIAL_SESSION);

  // Ensure AsyncStorage → MMKV migration completes before marking ready
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        setSession(prev => ({ ...prev, isLoading: true }));
        await preferences.loadPreferences();
        setSession(prev => ({ ...prev, isLoading: false, isInitialized: true }));
      } catch (error) {
        logger.warn('[UIProvider] Failed to load preferences', { error });
        setSession(prev => ({ ...prev, isLoading: false, isInitialized: true }));
      }
    };

    loadPreferences();
  }, []);

  const hasCompletedOnboarding = prefs.onboardingCompleted;
  const themePreference = prefs.theme || 'system';
  const themeId = prefs.themeId || ThemeIds.DEEP_SPACE;
  const fontId = prefs.fontId || FontIds.DEEP_SPACE;
  const userName = prefs.userName || '';
  const isPrivacyMode = prefs.isPrivacyMode || false;
  const isWidgetPrivacyEnabled = prefs.isWidgetPrivacyEnabled || false;
  const isAppLockEnabled = prefs.isAppLockEnabled || false;
  const showAccountMonthlyStats = prefs.showAccountMonthlyStats ?? true;
  const advancedMode = prefs.advancedMode || false;
  const archetype = prefs.archetype || AppConfig.defaults.archetype;
  const notificationCadence = prefs.notificationCadence || 'none';
  const notificationHour = prefs.notificationHour ?? AppConfig.defaults.notifications.defaultHour;
  const notificationMinute =
    prefs.notificationMinute ?? AppConfig.defaults.notifications.defaultMinute;
  const notificationWeekday =
    prefs.notificationWeekday ?? AppConfig.defaults.notifications.defaultWeekday;
  const defaultShareFormat = prefs.defaultShareFormat || ShareFormat.TEXT;
  const safeToSpendDays = prefs.safeToSpendDays || AppConfig.defaults.safeToSpendDays;
  const isSmsImportEnabled = prefs.isSmsImportEnabled || false;
  const isNativeAiEnabled = prefs.isNativeAiEnabled || false;
  const preferredAiModelId = prefs.preferredAiModelId || AppConfig.defaults.defaultAiModelId;
  const aiInferenceMode = prefs.aiInferenceMode || 'multi';

  const setFontsReady = useCallback(
    (fontsReady: boolean, nextFontId?: FontId) => {
      setSession(prev => ({
        ...prev,
        fontsReady,
        loadedFontId: fontsReady ? (nextFontId ?? fontId) : null,
      }));
    },
    [fontId],
  );

  const setDataHydrated = useCallback((isDataHydrated: boolean) => {
    setSession(prev => ({ ...prev, isDataHydrated }));
  }, []);

  const completeOnboarding = useCallback(async (name: string, archetypeValue?: string) => {
    try {
      await preferences.setUserName(name);
      if (archetypeValue) await preferences.setArchetype(archetypeValue);
      await preferences.setOnboardingCompleted(true);
    } catch (error) {
      logger.warn('[UIContext] Failed to complete onboarding', { error });
      // Preserve prior behavior: allow the UI to proceed even if persistence fails.
      try {
        preferences.setOnboardingCompleted(true);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const updateUserDetails = useCallback(async (name: string, archetypeValue?: string) => {
    try {
      if (name) await preferences.setUserName(name);
      if (archetypeValue) await preferences.setArchetype(archetypeValue);
    } catch (error) {
      logger.warn('[UIContext] Failed to update user details', { error });
    }
  }, []);

  const setThemePreference = useCallback(
    async (theme: 'light' | 'dark' | 'system') => {
      try {
        await preferences.themePrefs.setTheme(theme);
        analytics.logThemeChanged(theme, themeId, fontId);
      } catch (error) {
        logger.warn('[UIContext] Failed to set theme preference', { error });
      }
    },
    [themeId, fontId],
  );

  const setThemeId = useCallback(
    async (nextThemeId: ThemeId) => {
      try {
        await preferences.themePrefs.setThemeId(nextThemeId);
        analytics.logThemeChanged(themePreference, nextThemeId, fontId);
      } catch (error) {
        logger.warn('[UIContext] Failed to set theme ID', { error });
      }
    },
    [themePreference, fontId],
  );

  const setFontId = useCallback(
    async (nextFontId: FontId) => {
      try {
        await preferences.themePrefs.setFontId(nextFontId);
        analytics.logThemeChanged(themePreference, themeId, nextFontId);
      } catch (error) {
        logger.warn('[UIContext] Failed to set font ID', { error });
      }
    },
    [themePreference, themeId],
  );

  const setPrivacyMode = useCallback(async (nextIsPrivacyMode: boolean) => {
    try {
      await preferences.privacy.setIsPrivacyMode(nextIsPrivacyMode);
      analytics.trackFeatureUsage('settings', 'toggle_privacy_mode', {
        isPrivacyMode: nextIsPrivacyMode,
      });
    } catch (error) {
      logger.warn('[UIContext] Failed to set privacy mode', { error });
    }
  }, []);

  const setWidgetPrivacyEnabled = useCallback(async (enabled: boolean) => {
    try {
      await preferences.privacy.setIsWidgetPrivacyEnabled(enabled);
    } catch (error) {
      logger.warn('[UIContext] Failed to set widget privacy', { error });
    }
  }, []);

  const setAppLockEnabled = useCallback(async (enabled: boolean) => {
    try {
      await preferences.privacy.setAppLockEnabled(enabled);
    } catch (error) {
      logger.warn('[UIContext] Failed to set app lock', { error });
    }
  }, []);

  // Atomic Auth Action: ensuring consistency between unlock state and session access.
  const authenticateSession = useCallback((isUnlocked: boolean) => {
    setSession(prev => ({
      ...prev,
      isUnlocked,
      // Binding them together at the source as per hardened review.
      hasUnlockedThisSession: isUnlocked || prev.hasUnlockedThisSession,
    }));
  }, []);

  const setIsAppActive = useCallback((isAppActive: boolean) => {
    setSession(prev => ({ ...prev, isAppActive }));
  }, []);

  const setIsLockAuthenticating = useCallback((isLockAuthenticating: boolean) => {
    setSession(prev => ({ ...prev, isLockAuthenticating }));
  }, []);

  const setShowAccountMonthlyStats = useCallback(async (show: boolean) => {
    try {
      await preferences.setShowAccountMonthlyStats(show);
    } catch (error) {
      logger.warn('[UIContext] Failed to set account stats preference', { error });
    }
  }, []);

  const setArchetype = useCallback(async (nextArchetype: string) => {
    try {
      await preferences.setArchetype(nextArchetype);
    } catch (error) {
      logger.warn('[UIContext] Failed to set archetype', { error });
    }
  }, []);

  const setAdvancedMode = useCallback(async (nextAdvancedMode: boolean) => {
    try {
      await preferences.setAdvancedMode(nextAdvancedMode);
    } catch (error) {
      logger.warn('[UIContext] Failed to set advanced mode', { error });
    }
  }, []);

  const setNotificationCadence = useCallback(
    async (cadence: 'none' | 'daily' | 'weekly') => {
      try {
        await preferences.notifications.setNotificationCadence(cadence);
        analytics.logNotificationPreferenceChanged(cadence, notificationHour);
      } catch (error) {
        logger.warn('[UIContext] Failed to set notification cadence', { error });
      }
    },
    [notificationHour],
  );

  const setNotificationTime = useCallback(async (hour: number, minute: number) => {
    try {
      await preferences.notifications.setNotificationTime(hour, minute);
    } catch (error) {
      logger.warn('[UIContext] Failed to set notification time', { error });
    }
  }, []);

  const setNotificationWeekday = useCallback(async (weekday: number) => {
    try {
      await preferences.notifications.setNotificationWeekday(weekday);
    } catch (error) {
      logger.warn('[UIContext] Failed to set notification weekday', { error });
    }
  }, []);

  const setDefaultShareFormat = useCallback((format: ShareFormat) => {
    try {
      preferences.setDefaultShareFormat(format);
    } catch (error) {
      logger.warn('[UIContext] Failed to set default share format', { error });
    }
  }, []);

  const setSafeToSpendDays = useCallback(async (days: number) => {
    try {
      await preferences.sts.setSafeToSpendDays(days);
    } catch (error) {
      logger.warn('[UIContext] Failed to set safe to spend days', { error });
    }
  }, []);

  const setIsSmsImportEnabled = useCallback(async (enabled: boolean) => {
    try {
      await preferences.sms.setIsSmsImportEnabled(enabled);
      analytics.logSmsImportSettingsChanged(enabled);
    } catch (error) {
      logger.warn('[UIContext] Failed to set sms import preference', { error });
    }
  }, []);

  const setIsNativeAiEnabled = useCallback(async (enabled: boolean) => {
    try {
      await preferences.ai.setIsNativeAiEnabled(enabled);
    } catch (error) {
      logger.warn('[UIContext] Failed to set native AI preference', { error });
    }
  }, []);

  const setPreferredAiModelId = useCallback(async (modelId: string) => {
    try {
      await preferences.ai.setPreferredAiModelId(modelId);
    } catch (error) {
      logger.warn('[UIContext] Failed to set preferred AI model', { error });
    }
  }, []);

  const setAiInferenceMode = useCallback(async (mode: 'single' | 'multi') => {
    try {
      await preferences.ai.setAiInferenceMode(mode);
    } catch (error) {
      logger.warn('[UIContext] Failed to set AI inference mode', { error });
    }
  }, []);

  const requireRestart = useCallback((options: RestartOptions) => {
    setSession(prev => ({
      ...prev,
      isRestartRequired: true,
      restartType: options.type,
      importStats: options.stats || null,
    }));
  }, []);

  const themeMode = useMemo(() => {
    return themePreference === 'system'
      ? systemColorScheme === 'dark'
        ? 'dark'
        : 'light'
      : themePreference;
  }, [themePreference, systemColorScheme]);

  /**
   * BULLETPROOF LOCK TRUTH:
   * App is locked IF lock is enabled AND (
   *   1. It's not unlocked (unauthorized)
   *   OR
   *   2. The app is inactive/backgrounded AND we are NOT currently authenticating (switcher protection)
   * )
   *
   * Adding 'isLockAuthenticating' check prevents "stuck on lock" on iOS when FaceID prompt
   * makes the app 'inactive'.
   */
  const isAppCurrentlyLocked = useMemo(() => {
    const isActuallyBackgrounded = !session.isAppActive && !session.isLockAuthenticating;
    return isAppLockEnabled && (!session.isUnlocked || isActuallyBackgrounded);
  }, [
    isAppLockEnabled,
    session.isUnlocked,
    session.isAppActive,
    session.isLockAuthenticating,
  ]);

  const isAppReady = useMemo(
    () => session.isInitialized && session.fontsReady && session.loadedFontId === fontId,
    [session.isInitialized, session.fontsReady, session.loadedFontId, fontId],
  );

  const value = useMemo<UIContextType>(
    () => ({
      hasCompletedOnboarding,
      themePreference,
      themeId,
      fontId,
      userName,
      isPrivacyMode,
      isWidgetPrivacyEnabled,
      isAppLockEnabled,
      showAccountMonthlyStats,
      advancedMode,
      archetype,
      notificationCadence,
      notificationHour,
      notificationMinute,
      notificationWeekday,
      defaultShareFormat,
      safeToSpendDays,
      isSmsImportEnabled,
      isNativeAiEnabled,
      preferredAiModelId,
      aiInferenceMode,
      ...session,
      themeMode,
      isAppCurrentlyLocked,
      isAppReady,
      setFontsReady,
      setDataHydrated,
      completeOnboarding,
      setThemePreference,
      setThemeId,
      setFontId,
      updateUserDetails,
      setPrivacyMode,
      setWidgetPrivacyEnabled,
      setAppLockEnabled,
      authenticateSession,
      setIsAppActive,
      setIsLockAuthenticating,
      setShowAccountMonthlyStats,
      setArchetype,
      setAdvancedMode,
      setNotificationCadence,
      setNotificationTime,
      setNotificationWeekday,
      setDefaultShareFormat,
      setSafeToSpendDays,
      setIsSmsImportEnabled,
      setIsNativeAiEnabled,
      setPreferredAiModelId,
      setAiInferenceMode,
      requireRestart,
    }),
    [
      hasCompletedOnboarding,
      themePreference,
      themeId,
      fontId,
      userName,
      isPrivacyMode,
      isWidgetPrivacyEnabled,
      isAppLockEnabled,
      showAccountMonthlyStats,
      advancedMode,
      archetype,
      notificationCadence,
      notificationHour,
      notificationMinute,
      notificationWeekday,
      defaultShareFormat,
      safeToSpendDays,
      isSmsImportEnabled,
      isNativeAiEnabled,
      preferredAiModelId,
      aiInferenceMode,
      session,
      themeMode,
      isAppCurrentlyLocked,
      isAppReady,
      setFontsReady,
      setDataHydrated,
      completeOnboarding,
      setThemePreference,
      setThemeId,
      setFontId,
      updateUserDetails,
      setPrivacyMode,
      setWidgetPrivacyEnabled,
      setAppLockEnabled,
      authenticateSession,
      setIsAppActive,
      setIsLockAuthenticating,
      setShowAccountMonthlyStats,
      setArchetype,
      setAdvancedMode,
      setNotificationCadence,
      setNotificationTime,
      setNotificationWeekday,
      setDefaultShareFormat,
      setSafeToSpendDays,
      setIsSmsImportEnabled,
      setIsNativeAiEnabled,
      setPreferredAiModelId,
      setAiInferenceMode,
      requireRestart,
    ],
  );

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI() {
  const context = useContext(UIContext);
  if (context === undefined) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
}
