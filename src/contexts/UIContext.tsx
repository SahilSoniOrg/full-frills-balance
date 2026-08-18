/**
 * App shell contexts: boot/readiness, lock/session, restart/import, and onboarding.
 * Persisted prefs use scoped hooks (`useThemePrefs`, `usePrivacyPrefs`, …).
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

export interface AppReadyValue {
  isLoading: boolean;
  isInitialized: boolean;
  fontsReady: boolean;
  loadedFontId: FontId | null;
  isDataHydrated: boolean;
  isAppReady: boolean;
  setFontsReady: (ready: boolean, fontId?: FontId) => void;
  setDataHydrated: (hydrated: boolean) => void;
}

export interface AppLockValue {
  isUnlocked: boolean;
  hasUnlockedThisSession: boolean;
  isAppActive: boolean;
  isLockAuthenticating: boolean;
  isAppCurrentlyLocked: boolean;
  authenticateSession: (unlocked: boolean) => void;
  setIsAppActive: (isActive: boolean) => void;
  setIsLockAuthenticating: (isAuthenticating: boolean) => void;
}

export interface AppRestartValue {
  isRestartRequired: boolean;
  restartType: 'IMPORT' | 'RESET' | 'SEED_MOCK' | null;
  importStats: ImportStats | null;
  requireRestart: (options: RestartOptions) => void;
}

export interface AppOnboardingValue {
  hasCompletedOnboarding: boolean;
  completeOnboarding: (name: string, archetype?: string) => Promise<void>;
}

export type AppShellValue = AppReadyValue & AppLockValue & AppRestartValue & AppOnboardingValue;

const AppReadyContext = createContext<AppReadyValue | undefined>(undefined);
const AppLockContext = createContext<AppLockValue | undefined>(undefined);
const AppRestartContext = createContext<AppRestartValue | undefined>(undefined);
const AppOnboardingContext = createContext<AppOnboardingValue | undefined>(undefined);

function requireContext<T>(value: T | undefined, hookName: string): T {
  if (value === undefined) {
    throw new Error(`${hookName} must be used within a UIProvider`);
  }
  return value;
}

export function useAppReady(): AppReadyValue {
  return requireContext(useContext(AppReadyContext), 'useAppReady');
}

export function useAppLock(): AppLockValue {
  return requireContext(useContext(AppLockContext), 'useAppLock');
}

export function useAppRestart(): AppRestartValue {
  return requireContext(useContext(AppRestartContext), 'useAppRestart');
}

export function useOnboardingSession(): AppOnboardingValue {
  return requireContext(useContext(AppOnboardingContext), 'useOnboardingSession');
}

/** Compatibility aggregate for tests and mixed shell reads. Prefer the focused hooks. */
export function useUI(): AppShellValue {
  return {
    ...useAppReady(),
    ...useAppLock(),
    ...useAppRestart(),
    ...useOnboardingSession(),
  };
}

const ThemeOverrideContext = createContext<ThemeMode | null>(null);

export function ThemeOverride({ mode, children }: { mode?: ThemeMode; children: React.ReactNode }) {
  return (
    <ThemeOverrideContext.Provider value={mode ?? null}>{children}</ThemeOverrideContext.Provider>
  );
}

export function useThemeOverride() {
  return useContext(ThemeOverrideContext);
}

/** Test helper: feed one mock object into the four shell contexts. */
export function AppShellTestProvider({
  value,
  children,
}: {
  value: AppShellValue;
  children: React.ReactNode;
}) {
  return (
    <AppReadyContext.Provider value={value}>
      <AppLockContext.Provider value={value}>
        <AppRestartContext.Provider value={value}>
          <AppOnboardingContext.Provider value={value}>{children}</AppOnboardingContext.Provider>
        </AppRestartContext.Provider>
      </AppLockContext.Provider>
    </AppReadyContext.Provider>
  );
}

const INITIAL_READY = {
  isLoading: false,
  isInitialized: false,
  fontsReady: false,
  loadedFontId: null as FontId | null,
  isDataHydrated: false,
};

const INITIAL_LOCK = {
  isUnlocked: false,
  hasUnlockedThisSession: false,
  isAppActive: true,
  isLockAuthenticating: false,
};

const INITIAL_RESTART: Omit<AppRestartValue, 'requireRestart'> = {
  isRestartRequired: false,
  restartType: null,
  importStats: null,
};

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(INITIAL_READY);
  const [lock, setLock] = useState(INITIAL_LOCK);
  const [restart, setRestart] = useState(INITIAL_RESTART);

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

  useEffect(() => {
    const loadPreferences = async () => {
      try {
        setReady(prev => ({ ...prev, isLoading: true }));
        await preferences.loadPreferences();
        if (readE2eLaunchConfig()) {
          const { ensureE2eBootstrap } = await import('@/src/testing/e2eBootstrap');
          await ensureE2eBootstrap();
          await preferences.loadPreferences();
        }
        setReady(prev => ({ ...prev, isLoading: false, isInitialized: true }));
      } catch (error) {
        logger.warn('[UIProvider] Failed to load preferences', { error });
        setReady(prev => ({ ...prev, isLoading: false, isInitialized: true }));
      }
    };

    loadPreferences();
  }, []);

  const setFontsReady = useCallback(
    (fontsReady: boolean, nextFontId?: FontId) => {
      setReady(prev => ({
        ...prev,
        fontsReady,
        loadedFontId: fontsReady ? (nextFontId ?? fontId) : null,
      }));
    },
    [fontId],
  );

  const setDataHydrated = useCallback((isDataHydrated: boolean) => {
    setReady(prev => ({ ...prev, isDataHydrated }));
  }, []);

  const completeOnboarding = useCallback(async (name: string, archetypeValue?: string) => {
    try {
      await preferences.setUserName(name);
      if (archetypeValue) await preferences.setArchetype(archetypeValue);
      await preferences.setOnboardingCompleted(true);
    } catch (error) {
      logger.warn('[UIContext] Failed to complete onboarding', { error });
      try {
        preferences.setOnboardingCompleted(true);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const authenticateSession = useCallback((isUnlocked: boolean) => {
    setLock(prev => ({
      ...prev,
      isUnlocked,
      hasUnlockedThisSession: isUnlocked || prev.hasUnlockedThisSession,
    }));
  }, []);

  const setIsAppActive = useCallback((isAppActive: boolean) => {
    setLock(prev => ({ ...prev, isAppActive }));
  }, []);

  const setIsLockAuthenticating = useCallback((isLockAuthenticating: boolean) => {
    setLock(prev => ({ ...prev, isLockAuthenticating }));
  }, []);

  const requireRestart = useCallback((options: RestartOptions) => {
    setRestart({
      isRestartRequired: true,
      restartType: options.type,
      importStats: options.stats || null,
    });
  }, []);

  const isAppCurrentlyLocked = useMemo(() => {
    const isActuallyBackgrounded = !lock.isAppActive && !lock.isLockAuthenticating;
    return isAppLockEnabled && (!lock.isUnlocked || isActuallyBackgrounded);
  }, [isAppLockEnabled, lock.isUnlocked, lock.isAppActive, lock.isLockAuthenticating]);

  const isAppReady = useMemo(
    () => ready.isInitialized && ready.fontsReady && ready.loadedFontId === fontId,
    [ready.isInitialized, ready.fontsReady, ready.loadedFontId, fontId],
  );

  const readyValue = useMemo<AppReadyValue>(
    () => ({
      ...ready,
      isAppReady,
      setFontsReady,
      setDataHydrated,
    }),
    [ready, isAppReady, setFontsReady, setDataHydrated],
  );

  const lockValue = useMemo<AppLockValue>(
    () => ({
      ...lock,
      isAppCurrentlyLocked,
      authenticateSession,
      setIsAppActive,
      setIsLockAuthenticating,
    }),
    [lock, isAppCurrentlyLocked, authenticateSession, setIsAppActive, setIsLockAuthenticating],
  );

  const restartValue = useMemo<AppRestartValue>(
    () => ({
      ...restart,
      requireRestart,
    }),
    [restart, requireRestart],
  );

  const onboardingValue = useMemo<AppOnboardingValue>(
    () => ({
      hasCompletedOnboarding,
      completeOnboarding,
    }),
    [hasCompletedOnboarding, completeOnboarding],
  );

  return (
    <AppReadyContext.Provider value={readyValue}>
      <AppLockContext.Provider value={lockValue}>
        <AppRestartContext.Provider value={restartValue}>
          <AppOnboardingContext.Provider value={onboardingValue}>
            {children}
          </AppOnboardingContext.Provider>
        </AppRestartContext.Provider>
      </AppLockContext.Provider>
    </AppReadyContext.Provider>
  );
}
