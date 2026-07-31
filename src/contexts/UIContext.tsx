/**
 * App shell context: session/boot state (lock, fonts, import restart, onboarding
 * completion flag). Persisted prefs use scoped hooks (`useThemePrefs`,
 * `usePrivacyPrefs`, `useSharePrefs`, etc.) — this provider only does targeted
 * reads for shell-derived flags (onboarding, font readiness, app lock).
 */

import { FontId, FontIds, ThemeMode } from '@/src/constants/design-tokens';
import { readE2eLaunchConfig } from '@/src/testing/e2eLaunchArgs';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';

export interface ImportStats {
  accounts: number;
  journals: number;
  transactions: number;
  budgets?: number;
  auditLogs?: number;
  plannedPayments?: number;
  skippedTransactions: number;
  skippedItems?: { id: string; reason: string; description?: string }[];
  preImportBackupPath?: string;
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

interface UIContextType extends UISessionState {
  // Shell routing / onboarding
  hasCompletedOnboarding: boolean;

  // Derived
  isAppCurrentlyLocked: boolean;
  isAppReady: boolean;

  // Boot setters
  setFontsReady: (ready: boolean, fontId?: FontId) => void;
  setDataHydrated: (hydrated: boolean) => void;

  // Session / shell actions
  completeOnboarding: (name: string, archetype?: string) => Promise<void>;
  authenticateSession: (unlocked: boolean) => void;
  setIsAppActive: (isActive: boolean) => void;
  setIsLockAuthenticating: (isAuthenticating: boolean) => void;
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
  const [session, setSession] = useState<UISessionState>(INITIAL_SESSION);

  // Targeted pref reads only — never observeAll / usePreferences.
  const hasCompletedOnboarding = useSyncExternalStore(
    onStoreChange => {
      const sub = preferences.observe('onboardingCompleted').subscribe(() => onStoreChange());
      return () => sub.unsubscribe();
    },
    () => preferences.onboardingCompleted,
    () => preferences.onboardingCompleted,
  );

  const fontId = useSyncExternalStore(
    onStoreChange => {
      const sub = preferences.themePrefs.observeFontId().subscribe(() => onStoreChange());
      return () => sub.unsubscribe();
    },
    () => preferences.themePrefs.fontId || FontIds.DEEP_SPACE,
    () => preferences.themePrefs.fontId || FontIds.DEEP_SPACE,
  );

  const isAppLockEnabled = useSyncExternalStore(
    onStoreChange => {
      const sub = preferences.privacy.observeAppLockEnabled().subscribe(() => onStoreChange());
      return () => sub.unsubscribe();
    },
    () => preferences.privacy.isAppLockEnabled || false,
    () => preferences.privacy.isAppLockEnabled || false,
  );

  // Ensure AsyncStorage → MMKV migration completes before marking ready
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        setSession(prev => ({ ...prev, isLoading: true }));
        await preferences.loadPreferences();
        if (readE2eLaunchConfig()) {
          const { ensureE2eBootstrap } = await import('@/src/testing/e2eBootstrap');
          await ensureE2eBootstrap();
          await preferences.loadPreferences();
        }
        setSession(prev => ({ ...prev, isLoading: false, isInitialized: true }));
      } catch (error) {
        logger.warn('[UIProvider] Failed to load preferences', { error });
        setSession(prev => ({ ...prev, isLoading: false, isInitialized: true }));
      }
    };

    loadPreferences();
  }, []);

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

  const requireRestart = useCallback((options: RestartOptions) => {
    setSession(prev => ({
      ...prev,
      isRestartRequired: true,
      restartType: options.type,
      importStats: options.stats || null,
    }));
  }, []);

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
  }, [isAppLockEnabled, session.isUnlocked, session.isAppActive, session.isLockAuthenticating]);

  const isAppReady = useMemo(
    () => session.isInitialized && session.fontsReady && session.loadedFontId === fontId,
    [session.isInitialized, session.fontsReady, session.loadedFontId, fontId],
  );

  const value = useMemo<UIContextType>(
    () => ({
      hasCompletedOnboarding,
      ...session,
      isAppCurrentlyLocked,
      isAppReady,
      setFontsReady,
      setDataHydrated,
      completeOnboarding,
      authenticateSession,
      setIsAppActive,
      setIsLockAuthenticating,
      requireRestart,
    }),
    [
      hasCompletedOnboarding,
      session,
      isAppCurrentlyLocked,
      isAppReady,
      setFontsReady,
      setDataHydrated,
      completeOnboarding,
      authenticateSession,
      setIsAppActive,
      setIsLockAuthenticating,
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
