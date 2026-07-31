import { FontId, FontIds, ThemeId, ThemeIds, ThemeMode } from '@/src/constants/design-tokens';
import { preferences } from '@/src/utils/preferences';
import type { ThemeAppearance } from '@/src/utils/preferences';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useColorScheme } from 'react-native';

export type ThemePrefsState = {
  themePreference: ThemeAppearance;
  /** Resolved light/dark after applying system preference. */
  themeMode: ThemeMode;
  themeId: ThemeId;
  fontId: FontId;
  setThemePreference: (theme: ThemeAppearance) => void;
  setThemeId: (themeId: ThemeId) => void;
  setFontId: (fontId: FontId) => void;
};

/**
 * Scoped theme / typography prefs — expandable without growing UIContext.
 */
export function useThemePrefs(): ThemePrefsState {
  const systemColorScheme = useColorScheme();

  const themePreference = useSyncExternalStore(
    onStoreChange => {
      const sub = preferences.themePrefs.observeTheme().subscribe(() => {
        onStoreChange();
      });
      return () => sub.unsubscribe();
    },
    () => preferences.themePrefs.theme || 'system',
    () => preferences.themePrefs.theme || 'system',
  );

  const themeId = useSyncExternalStore(
    onStoreChange => {
      const sub = preferences.themePrefs.observeThemeId().subscribe(() => {
        onStoreChange();
      });
      return () => sub.unsubscribe();
    },
    () => preferences.themePrefs.themeId || ThemeIds.DEEP_SPACE,
    () => preferences.themePrefs.themeId || ThemeIds.DEEP_SPACE,
  );

  const fontId = useSyncExternalStore(
    onStoreChange => {
      const sub = preferences.themePrefs.observeFontId().subscribe(() => {
        onStoreChange();
      });
      return () => sub.unsubscribe();
    },
    () => preferences.themePrefs.fontId || FontIds.DEEP_SPACE,
    () => preferences.themePrefs.fontId || FontIds.DEEP_SPACE,
  );

  const themeMode = useMemo<ThemeMode>(() => {
    return themePreference === 'system'
      ? systemColorScheme === 'dark'
        ? 'dark'
        : 'light'
      : themePreference;
  }, [themePreference, systemColorScheme]);

  const setThemePreference = useCallback((theme: ThemeAppearance) => {
    preferences.themePrefs.setTheme(theme);
  }, []);

  const setThemeId = useCallback((nextThemeId: ThemeId) => {
    preferences.themePrefs.setThemeId(nextThemeId);
  }, []);

  const setFontId = useCallback((nextFontId: FontId) => {
    preferences.themePrefs.setFontId(nextFontId);
  }, []);

  return {
    themePreference,
    themeMode,
    themeId,
    fontId,
    setThemePreference,
    setThemeId,
    setFontId,
  };
}
