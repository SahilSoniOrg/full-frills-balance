import { FontId, FontIds } from '@/src/constants/design-tokens';
import { requireShellContext } from '@/src/contexts/app-shell/requireShellContext';
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

export const AppReadyContext = createContext<AppReadyValue | undefined>(undefined);

export function useAppReady(): AppReadyValue {
  return requireShellContext(useContext(AppReadyContext), 'useAppReady');
}

const INITIAL_READY = {
  isLoading: false,
  isInitialized: false,
  fontsReady: false,
  loadedFontId: null as FontId | null,
  isDataHydrated: false,
};

export function AppReadyProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(INITIAL_READY);

  const fontId = useSyncExternalStore(
    onStoreChange => {
      const sub = preferences.themePrefs.observeFontId().subscribe(() => onStoreChange());
      return () => sub.unsubscribe();
    },
    () => preferences.themePrefs.fontId || FontIds.DEEP_SPACE,
    () => preferences.themePrefs.fontId || FontIds.DEEP_SPACE,
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

  const isAppReady = useMemo(
    () => ready.isInitialized && ready.fontsReady && ready.loadedFontId === fontId,
    [ready.isInitialized, ready.fontsReady, ready.loadedFontId, fontId],
  );

  const value = useMemo<AppReadyValue>(
    () => ({
      ...ready,
      isAppReady,
      setFontsReady,
      setDataHydrated,
    }),
    [ready, isAppReady, setFontsReady, setDataHydrated],
  );

  return <AppReadyContext.Provider value={value}>{children}</AppReadyContext.Provider>;
}
