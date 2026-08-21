import { FontId, ThemeId } from '@/src/constants/design-tokens';
import { useAccountDisplayPrefs } from '@/src/hooks/useAccountDisplayPrefs';
import { useThemePrefs } from '@/src/hooks/useThemePrefs';
import { analytics } from '@/src/services/analytics';
import { useCallback } from 'react';

export interface AppearanceSettingsViewModel {
  themePreference: 'system' | 'light' | 'dark';
  setThemePreference: (value: 'system' | 'light' | 'dark') => void;
  themeId: ThemeId;
  setThemeId: (value: ThemeId) => void;
  fontId: FontId;
  setFontId: (value: FontId) => void;
  showAccountMonthlyStats: boolean;
  onToggleAccountMonthlyStats: () => void;
}

export function useAppearanceSettingsViewModel(): AppearanceSettingsViewModel {
  const { themePreference, setThemePreference, themeId, setThemeId, fontId, setFontId } =
    useThemePrefs();
  const { showAccountMonthlyStats, setShowAccountMonthlyStats } = useAccountDisplayPrefs();

  const handleSetThemePreference = useCallback(
    (value: 'system' | 'light' | 'dark') => {
      setThemePreference(value);
      analytics.logThemeChanged(value, themeId, fontId);
      analytics.trackFeatureUsage('settings', 'change_theme_preference', {
        preference: value,
      });
    },
    [setThemePreference, themeId, fontId],
  );

  const handleSetThemeId = useCallback(
    (value: ThemeId) => {
      setThemeId(value);
      analytics.logThemeChanged(themePreference, value, fontId);
      analytics.trackFeatureUsage('settings', 'change_theme', {
        theme_id: value,
      });
    },
    [setThemeId, themePreference, fontId],
  );

  const handleSetFontId = useCallback(
    (value: FontId) => {
      setFontId(value);
      analytics.logThemeChanged(themePreference, themeId, value);
      analytics.trackFeatureUsage('settings', 'change_font', {
        font_id: value,
      });
    },
    [setFontId, themePreference, themeId],
  );

  const onToggleAccountMonthlyStats = useCallback(() => {
    setShowAccountMonthlyStats(!showAccountMonthlyStats);
    analytics.trackFeatureUsage('settings', 'toggle_monthly_stats', {
      new_state: !showAccountMonthlyStats,
    });
  }, [setShowAccountMonthlyStats, showAccountMonthlyStats]);

  return {
    themePreference,
    setThemePreference: handleSetThemePreference,
    themeId,
    setThemeId: handleSetThemeId,
    fontId,
    setFontId: handleSetFontId,
    showAccountMonthlyStats,
    onToggleAccountMonthlyStats,
  };
}
