import { FontId, FontIds, ThemeId, ThemeIds, ThemeMode } from '@/src/constants/design-tokens';
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
  const themePreference = storedThemePreference || 'system';
  const themeId = storedThemeId || ThemeIds.DEEP_SPACE;
  const fontId = storedFontId || FontIds.DEEP_SPACE;

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
