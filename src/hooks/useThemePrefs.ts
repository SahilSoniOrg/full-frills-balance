import { FontId, ThemeId, ThemeMode } from '@/src/constants/design-tokens';
import { DEFAULT_UI_PREFERENCES } from '@/src/services/preferences';
import type { ThemeAppearance } from '@/src/services/preferences';
import { usePreference } from '@/src/hooks/usePreference';
import { commitFontIdAfterLoad } from '@/src/utils/loadFontSet';
import { useCallback, useMemo } from 'react';
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

  const { value: storedThemePreference, setValue: setStoredThemePreference } =
    usePreference('theme');
  const { value: storedThemeId, setValue: setStoredThemeId } = usePreference('themeId');
  const { value: storedFontId, setValue: setStoredFontId } = usePreference('fontId');
  const themePreference = storedThemePreference ?? DEFAULT_UI_PREFERENCES.theme;
  const themeId = storedThemeId ?? DEFAULT_UI_PREFERENCES.themeId;
  const fontId = storedFontId ?? DEFAULT_UI_PREFERENCES.fontId;

  const themeMode = useMemo<ThemeMode>(() => {
    return themePreference === 'system'
      ? systemColorScheme === 'dark'
        ? 'dark'
        : 'light'
      : themePreference;
  }, [themePreference, systemColorScheme]);

  const setThemePreference = useCallback(
    (theme: ThemeAppearance) => {
      setStoredThemePreference(theme);
    },
    [setStoredThemePreference],
  );

  const setThemeId = useCallback(
    (nextThemeId: ThemeId) => {
      setStoredThemeId(nextThemeId);
    },
    [setStoredThemeId],
  );

  const setFontId = useCallback(
    (nextFontId: FontId) => {
      void commitFontIdAfterLoad(nextFontId, id => {
        setStoredFontId(id as FontId);
      });
    },
    [setStoredFontId],
  );

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
