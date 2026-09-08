import { FontId, FontIds } from '@/src/constants/design-tokens';
import { AppReadyContext, type AppReadyValue } from '@/src/contexts/app-shell/appReady';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/services/preferences';
import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';

export {
  AppReadyContext,
  useAppReady,
  type AppReadyValue,
} from '@/src/contexts/app-shell/appReady';

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
      const start = performance.now();
      try {
        setReady(prev => ({ ...prev, isLoading: true }));
        await preferences.loadPreferences();
        if (process.env.EXPO_PUBLIC_E2E === '1') {
          const { readE2eLaunchConfig } = await import('@/src/testing/e2eLaunchArgs');
          if (readE2eLaunchConfig()) {
            const { ensureE2eBootstrap } = await import('@/src/testing/e2eBootstrap');
            await ensureE2eBootstrap();
            await preferences.loadPreferences();
          }
        }
        setReady(prev => ({ ...prev, isLoading: false, isInitialized: true }));
        logger.info(`[Startup] Preferences ready in ${Math.round(performance.now() - start)}ms`);
      } catch (error) {
        logger.warn('[UIProvider] Failed to load preferences', { error });
        setReady(prev => ({ ...prev, isLoading: false, isInitialized: true }));
        logger.info(
          `[Startup] Preferences fallback ready in ${Math.round(performance.now() - start)}ms`,
        );
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

  // Keep the shell mounted after the first set loads; matching fontId on
  // every switch unmounted routes while the next files were still loading.
  const isAppReady = ready.isInitialized && ready.fontsReady && ready.loadedFontId !== null;

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
