/**
 * UI Context - Simple UI state management
 *
 * ========================================
 * HARD RULES FOR THIS CONTEXT:
 * ========================================
 * - MAY contain: onboarding flags, theme preference, simple UI state
 * - MAY NOT contain: domain data, business logic, derived values, repository calls
 * - If it needs persistence → utils/preferences.ts
 * - If it needs logic → repository
 * - If it needs data → database
 * ========================================
 */

import { AppConfig, FontId, FontIds, ThemeId, ThemeIds, ThemeMode } from '@/src/constants';
import { analytics } from '@/src/services/analytics-service';
import { ShareFormat } from '@/src/types/sharing';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

export type BootEvent = 'FONTS_LOADED' | 'DATA_HYDRATED';

// Simple UI state only - no domain data
interface UIState {
  // Onboarding state
  hasCompletedOnboarding: boolean;

  // Theme preference
  themePreference: 'light' | 'dark' | 'system';
  themeId: ThemeId;
  fontId: FontId;

  // Simple UI flags
  isLoading: boolean;
  isInitialized: boolean; // Track if preferences are loaded

  // User details
  userName: string;

  // Privacy
  isPrivacyMode: boolean;
  isWidgetPrivacyEnabled: boolean;
  isAppLockEnabled: boolean;
  isUnlocked: boolean; // App lock transient state
  hasUnlockedThisSession: boolean; // Session transient state for cold boot protection
  isAppActive: boolean; // Track OS AppState in global context
  isLockAuthenticating: boolean; // Track if biometric prompt is visible
  fontsReady: boolean; // Track if fonts are loaded

  // Account Display
  showAccountMonthlyStats: boolean;

  // Advanced Mode
  advancedMode: boolean;

  // App Lifecycle
  isRestartRequired: boolean;
  restartType: 'IMPORT' | 'RESET' | null;
  importStats: {
    accounts: number;
    journals: number;
    transactions: number;
    budgets?: number;
    auditLogs?: number;
    plannedPayments?: number;
    skippedTransactions: number;
    skippedItems?: { id: string; reason: string; description?: string }[];
  } | null;
  archetype: string;
  notificationCadence: 'none' | 'daily' | 'weekly';
  notificationHour: number;
  notificationMinute: number;
  notificationWeekday: number;
  defaultShareFormat: ShareFormat;
  safeToSpendDays: number;
  isSmsImportEnabled: boolean;
  isDataHydrated: boolean; // Tracks if core domain data is primed
}

interface UIContextType extends UIState {
  // Computed values
  themeMode: 'light' | 'dark';
  isAppReady: boolean;
  isAppCurrentlyLocked: boolean; // BULLETPROOF: blocking logic unified for UI and services

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
  dispatchBootEvent: (event: BootEvent) => void;
  setShowAccountMonthlyStats: (show: boolean) => Promise<void>;
  setArchetype: (archetype: string) => Promise<void>;
  setAdvancedMode: (advancedMode: boolean) => Promise<void>;
  setNotificationCadence: (cadence: 'none' | 'daily' | 'weekly') => Promise<void>;
  setNotificationTime: (hour: number, minute: number) => Promise<void>;
  setNotificationWeekday: (weekday: number) => Promise<void>;
  setDefaultShareFormat: (format: ShareFormat) => void;
  setSafeToSpendDays: (days: number) => Promise<void>;
  setIsSmsImportEnabled: (enabled: boolean) => Promise<void>;
  requireRestart: (options: {
    type: 'IMPORT' | 'RESET';
    stats?: {
      accounts: number;
      journals: number;
      transactions: number;
      budgets?: number;
      auditLogs?: number;
      plannedPayments?: number;
      skippedTransactions: number;
      skippedItems?: { id: string; reason: string; description?: string }[];
    };
  }) => void;
}

export const UIContext = createContext<UIContextType | undefined>(undefined);

export function UIProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useColorScheme();

  const [uiState, setUIState] = useState<UIState>({
    hasCompletedOnboarding: false,
    themePreference: 'system',
    themeId: ThemeIds.DEEP_SPACE, // Default
    fontId: FontIds.DEEP_SPACE, // Default
    isLoading: false,
    isInitialized: false,
    userName: '',
    isPrivacyMode: false,
    isWidgetPrivacyEnabled: false,
    isAppLockEnabled: false,
    isUnlocked: false,
    hasUnlockedThisSession: false,
    isAppActive: true, // Default to true on boot
    isLockAuthenticating: false, // Default to false
    showAccountMonthlyStats: true,
    advancedMode: false,
    isRestartRequired: false,
    restartType: null,
    importStats: null,
    archetype: AppConfig.defaults.archetype,
    notificationCadence: 'none',
    notificationHour: AppConfig.defaults.notifications.defaultHour,
    notificationMinute: AppConfig.defaults.notifications.defaultMinute,
    notificationWeekday: AppConfig.defaults.notifications.defaultWeekday,
    fontsReady: false,
    defaultShareFormat: ShareFormat.TEXT,
    safeToSpendDays: AppConfig.defaults.safeToSpendDays,
    isSmsImportEnabled: false,
    isDataHydrated: false,
  });

  // Load preferences on mount
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        setUIState(prev => ({ ...prev, isLoading: true }));

        const loadedPreferences = await preferences.loadPreferences();
        const themePreference = loadedPreferences.theme || 'system';
        const themeId = loadedPreferences.themeId || ThemeIds.DEEP_SPACE;
        const fontId = loadedPreferences.fontId || ThemeIds.DEEP_SPACE;

        setUIState(prev => ({
          ...prev,
          hasCompletedOnboarding: loadedPreferences.onboardingCompleted,
          themePreference,
          themeId,
          fontId,
          userName: loadedPreferences.userName || '',
          isPrivacyMode: loadedPreferences.isPrivacyMode || false,
          isWidgetPrivacyEnabled: loadedPreferences.isWidgetPrivacyEnabled || false,
          isAppLockEnabled: loadedPreferences.isAppLockEnabled || false,
          showAccountMonthlyStats: loadedPreferences.showAccountMonthlyStats ?? true,
          advancedMode: loadedPreferences.advancedMode || false,
          isRestartRequired: false,
          restartType: null,
          importStats: null,
          isLoading: false,
          isInitialized: true,
          archetype: loadedPreferences.archetype || 'balance-glancer',
          notificationCadence: loadedPreferences.notificationCadence || 'none',
          notificationHour: loadedPreferences.notificationHour ?? 10,
          notificationMinute: loadedPreferences.notificationMinute ?? 0,
          notificationWeekday: loadedPreferences.notificationWeekday ?? 1,
          defaultShareFormat: loadedPreferences.defaultShareFormat || ShareFormat.TEXT,
          safeToSpendDays: loadedPreferences.safeToSpendDays || AppConfig.defaults.safeToSpendDays,
          isSmsImportEnabled: loadedPreferences.isSmsImportEnabled || false,
        }));
      } catch (error) {
        logger.warn('Failed to load preferences', { error });
        setUIState(prev => ({ ...prev, isLoading: false, isInitialized: true }));
      }
    };

    loadPreferences();
  }, []);

  // Synchronize onboarding state with preferences
  useEffect(() => {
    const subscription = preferences.observe('onboardingCompleted').subscribe(completed => {
      setUIState(prev => {
        if (prev.hasCompletedOnboarding === completed) return prev;
        return { ...prev, hasCompletedOnboarding: completed };
      });
    });
    return () => subscription.unsubscribe();
  }, []);

  const completeOnboarding = useCallback(async (name: string, archetype?: string) => {
    try {
      preferences.setUserName(name);
      if (archetype) preferences.setArchetype(archetype);
      preferences.setOnboardingCompleted(true);
      setUIState(prev => ({
        ...prev,
        hasCompletedOnboarding: true,
        userName: name,
        archetype: archetype || prev.archetype,
      }));
    } catch (error) {
      logger.warn('Failed to save onboarding state', { error });
      setUIState(prev => ({ ...prev, hasCompletedOnboarding: true }));
    }
  }, []);

  const updateUserDetails = useCallback(async (name: string, archetype?: string) => {
    try {
      if (name) await preferences.setUserName(name);
      if (archetype) await preferences.setArchetype(archetype);
      setUIState(prev => ({
        ...prev,
        userName: name || prev.userName,
        archetype: archetype || prev.archetype,
      }));
    } catch (error) {
      logger.warn('Failed to update user details', { error });
    }
  }, []);

  const setThemePreference = useCallback(
    async (theme: 'light' | 'dark' | 'system') => {
      try {
        await preferences.setTheme(theme);
        setUIState(prev => ({ ...prev, themePreference: theme }));
        analytics.logThemeChanged(theme, uiState.themeId, uiState.fontId);
      } catch (error) {
        logger.warn('Failed to save theme preference', { error });
        setUIState(prev => ({ ...prev, themePreference: theme }));
      }
    },
    [uiState.themeId, uiState.fontId],
  );

  const setThemeId = useCallback(
    async (themeId: ThemeId) => {
      try {
        await preferences.setThemeId(themeId);
        setUIState(prev => ({ ...prev, themeId }));
        analytics.logThemeChanged(uiState.themePreference, themeId, uiState.fontId);
      } catch (error) {
        logger.warn('Failed to save theme ID', { error });
        setUIState(prev => ({ ...prev, themeId }));
      }
    },
    [uiState.themePreference, uiState.fontId],
  );

  const setFontId = useCallback(
    async (fontId: FontId) => {
      try {
        await preferences.setFontId(fontId);
        setUIState(prev => ({ ...prev, fontId }));
        analytics.logThemeChanged(uiState.themePreference, uiState.themeId, fontId);
      } catch (error) {
        logger.warn('Failed to save font ID', { error });
        setUIState(prev => ({ ...prev, fontId }));
      }
    },
    [uiState.themePreference, uiState.themeId],
  );

  const setPrivacyMode = useCallback(async (isPrivacyMode: boolean) => {
    try {
      await preferences.setIsPrivacyMode(isPrivacyMode);
      setUIState(prev => ({ ...prev, isPrivacyMode }));
      analytics.trackFeatureUsage('settings', 'toggle_privacy_mode', { isPrivacyMode });
    } catch (error) {
      logger.warn('Failed to save privacy mode', { error });
      setUIState(prev => ({ ...prev, isPrivacyMode }));
    }
  }, []);

  const setWidgetPrivacyEnabled = useCallback(async (isWidgetPrivacyEnabled: boolean) => {
    try {
      await preferences.setIsWidgetPrivacyEnabled(isWidgetPrivacyEnabled);
      setUIState(prev => ({ ...prev, isWidgetPrivacyEnabled }));
    } catch (error) {
      logger.warn('Failed to save widget privacy mode', { error });
      setUIState(prev => ({ ...prev, isWidgetPrivacyEnabled }));
    }
  }, []);

  const setAppLockEnabled = useCallback(async (isAppLockEnabled: boolean) => {
    try {
      await preferences.setAppLockEnabled(isAppLockEnabled);
      setUIState(prev => ({ ...prev, isAppLockEnabled }));
    } catch (error) {
      logger.warn('Failed to save app lock preference', { error });
      setUIState(prev => ({ ...prev, isAppLockEnabled }));
    }
  }, []);

  // Atomic Auth Action: ensuring consistency between unlock state and session access.
  const authenticateSession = useCallback((isUnlocked: boolean) => {
    setUIState(prev => ({
      ...prev,
      isUnlocked,
      // Binding them together at the source as per hardened review.
      hasUnlockedThisSession: isUnlocked || prev.hasUnlockedThisSession,
    }));
  }, []);

  const setIsAppActive = useCallback((isAppActive: boolean) => {
    setUIState(prev => ({ ...prev, isAppActive }));
  }, []);

  const setIsLockAuthenticating = useCallback((isLockAuthenticating: boolean) => {
    setUIState(prev => ({ ...prev, isLockAuthenticating }));
  }, []);

  const dispatchBootEvent = useCallback((event: BootEvent) => {
    setUIState(prev => {
      let nextIsInitialized = prev.isInitialized;
      let nextFontsReady = prev.fontsReady;
      let nextIsDataHydrated = prev.isDataHydrated;

      if (event === 'FONTS_LOADED') nextFontsReady = true;
      if (event === 'DATA_HYDRATED') nextIsDataHydrated = true;

      return {
        ...prev,
        isInitialized: nextIsInitialized,
        fontsReady: nextFontsReady,
        isDataHydrated: nextIsDataHydrated,
      };
    });
  }, []);

  const setShowAccountMonthlyStats = useCallback(async (showAccountMonthlyStats: boolean) => {
    try {
      await preferences.setShowAccountMonthlyStats(showAccountMonthlyStats);
      setUIState(prev => ({ ...prev, showAccountMonthlyStats }));
    } catch (error) {
      logger.warn('Failed to save account stats preference', { error });
      setUIState(prev => ({ ...prev, showAccountMonthlyStats }));
    }
  }, []);

  const setArchetype = useCallback(async (archetype: string) => {
    try {
      await preferences.setArchetype(archetype);
      setUIState(prev => ({ ...prev, archetype }));
    } catch (error) {
      logger.warn('Failed to save archetype', { error });
      setUIState(prev => ({ ...prev, archetype }));
    }
  }, []);

  const setAdvancedMode = useCallback(async (advancedMode: boolean) => {
    try {
      await preferences.setAdvancedMode(advancedMode);
      setUIState(prev => ({ ...prev, advancedMode }));
    } catch (error) {
      logger.warn('Failed to save advanced mode', { error });
      setUIState(prev => ({ ...prev, advancedMode }));
    }
  }, []);

  const setNotificationCadence = useCallback(
    async (cadence: 'none' | 'daily' | 'weekly') => {
      try {
        await preferences.setNotificationCadence(cadence);
        setUIState(prev => ({ ...prev, notificationCadence: cadence }));
        analytics.logNotificationPreferenceChanged(cadence, uiState.notificationHour);
      } catch (error) {
        logger.warn('Failed to save notification cadence', { error });
        setUIState(prev => ({ ...prev, notificationCadence: cadence }));
      }
    },
    [uiState.notificationHour],
  );

  const setNotificationTime = useCallback(async (hour: number, minute: number) => {
    try {
      await preferences.setNotificationHour(hour);
      await preferences.setNotificationMinute(minute);
      setUIState(prev => ({ ...prev, notificationHour: hour, notificationMinute: minute }));
    } catch (error) {
      logger.warn('Failed to save notification time', { error });
      setUIState(prev => ({ ...prev, notificationHour: hour, notificationMinute: minute }));
    }
  }, []);

  const setNotificationWeekday = useCallback(async (weekday: number) => {
    try {
      await preferences.setNotificationWeekday(weekday);
      setUIState(prev => ({ ...prev, notificationWeekday: weekday }));
    } catch (error) {
      logger.warn('Failed to save notification weekday', { error });
      setUIState(prev => ({ ...prev, notificationWeekday: weekday }));
    }
  }, []);

  const setDefaultShareFormat = useCallback((format: ShareFormat) => {
    setUIState(prev => {
      if (prev.defaultShareFormat === format) return prev;
      return { ...prev, defaultShareFormat: format };
    });

    try {
      preferences.setDefaultShareFormat(format);
    } catch (error) {
      logger.warn('Failed to save default share format', { error });
    }
  }, []);

  const setSafeToSpendDays = useCallback(async (days: number) => {
    try {
      await preferences.setSafeToSpendDays(days);
      setUIState(prev => ({ ...prev, safeToSpendDays: days }));
    } catch (error) {
      logger.warn('Failed to save safe to spend days', { error });
      setUIState(prev => ({ ...prev, safeToSpendDays: days }));
    }
  }, []);

  const setIsSmsImportEnabled = useCallback(async (enabled: boolean) => {
    try {
      await preferences.setIsSmsImportEnabled(enabled);
      setUIState(prev => ({ ...prev, isSmsImportEnabled: enabled }));
      analytics.logSmsImportSettingsChanged(enabled);
    } catch (error) {
      logger.warn('Failed to save SMS import preference', { error });
    }
  }, []);

  const requireRestart = useCallback(
    (options: {
      type: 'IMPORT' | 'RESET';
      stats?: {
        accounts: number;
        journals: number;
        transactions: number;
        budgets?: number;
        auditLogs?: number;
        plannedPayments?: number;
        skippedTransactions: number;
        skippedItems?: { id: string; reason: string; description?: string }[];
      };
    }) => {
      setUIState(prev => ({
        ...prev,
        isRestartRequired: true,
        restartType: options.type,
        importStats: options.stats || null,
      }));
    },
    [],
  );

  const themeMode = useMemo(() => {
    return uiState.themePreference === 'system'
      ? systemColorScheme === 'dark'
        ? 'dark'
        : 'light'
      : uiState.themePreference;
  }, [uiState.themePreference, systemColorScheme]);

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
    const isActuallyBackgrounded = !uiState.isAppActive && !uiState.isLockAuthenticating;
    return uiState.isAppLockEnabled && (!uiState.isUnlocked || isActuallyBackgrounded);
  }, [
    uiState.isAppLockEnabled,
    uiState.isUnlocked,
    uiState.isAppActive,
    uiState.isLockAuthenticating,
  ]);

  const isAppReady = useMemo(
    () => uiState.isInitialized && uiState.fontsReady && uiState.isDataHydrated,
    [uiState.isInitialized, uiState.fontsReady, uiState.isDataHydrated],
  );

  const value = useMemo<UIContextType>(
    () => ({
      ...uiState,
      isAppReady,
      themeMode,
      isAppCurrentlyLocked,
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
      dispatchBootEvent,
      requireRestart,
    }),
    [
      uiState,
      isAppReady,
      themeMode,
      isAppCurrentlyLocked,
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
      dispatchBootEvent,
      requireRestart,
    ],
  );

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

// Support for local theme overrides (e.g. Design Preview)
const ThemeOverrideContext = createContext<ThemeMode | undefined>(undefined);

export function ThemeOverride({ mode, children }: { mode: ThemeMode; children: React.ReactNode }) {
  return <ThemeOverrideContext.Provider value={mode}>{children}</ThemeOverrideContext.Provider>;
}

export function useThemeOverride() {
  return useContext(ThemeOverrideContext);
}

export function useUI() {
  const context = useContext(UIContext);
  if (context === undefined) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
}
