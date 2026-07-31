import { FontId, FontIds, ThemeId, ThemeIds } from '@/src/constants/design-tokens';
import { preferences } from '@/src/utils/preferences';
import type { ThemeAppearance } from '@/src/utils/preferences';
import { useCallback, useSyncExternalStore } from 'react';

export type ThemePrefsState = {
  themePreference: ThemeAppearance;
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
    themeId,
    fontId,
    setThemePreference,
    setThemeId,
    setFontId,
  };
}
