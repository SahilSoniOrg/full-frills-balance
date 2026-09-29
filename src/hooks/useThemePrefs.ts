import { FontId, FontIds, ThemeId, ThemeIds, ThemeMode } from '@/src/constants/design-tokens';
import { preferences } from '@/src/services/preferences';
import type { ThemeAppearance } from '@/src/services/preferences';
import { commitFontIdAfterLoad } from '@/src/utils/loadFontSet';
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
      const sub = preferences.observe('theme').subscribe(() => {
        onStoreChange();
      });
      return () => sub.unsubscribe();
    },
    () => preferences.getSnapshot().theme || 'system',
    () => preferences.getSnapshot().theme || 'system',
  );

  const themeId = useSyncExternalStore(
    onStoreChange => {
      const sub = preferences.observe('themeId').subscribe(() => {
        onStoreChange();
      });
      return () => sub.unsubscribe();
    },
    () => preferences.getSnapshot().themeId || ThemeIds.DEEP_SPACE,
    () => preferences.getSnapshot().themeId || ThemeIds.DEEP_SPACE,
  );

  const fontId = useSyncExternalStore(
    onStoreChange => {
      const sub = preferences.observe('fontId').subscribe(() => {
        onStoreChange();
      });
      return () => sub.unsubscribe();
    },
    () => preferences.getSnapshot().fontId || FontIds.DEEP_SPACE,
    () => preferences.getSnapshot().fontId || FontIds.DEEP_SPACE,
  );

  const themeMode = useMemo<ThemeMode>(() => {
    return themePreference === 'system'
      ? systemColorScheme === 'dark'
        ? 'dark'
        : 'light'
      : themePreference;
  }, [themePreference, systemColorScheme]);

  const setThemePreference = useCallback((theme: ThemeAppearance) => {
    preferences.update({ theme });
  }, []);

  const setThemeId = useCallback((nextThemeId: ThemeId) => {
    preferences.update({ themeId: nextThemeId });
  }, []);

  const setFontId = useCallback((nextFontId: FontId) => {
    void commitFontIdAfterLoad(nextFontId, id => {
      preferences.update({ fontId: id as FontId });
    });
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
