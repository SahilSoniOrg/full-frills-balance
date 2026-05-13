import { FontId, ThemeId } from '@/src/constants/design-tokens';
import { useUI } from '@/src/contexts/UIContext';
import { analytics } from '@/src/services/analytics-service';
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
  const ui = useUI();
  const {
    themePreference,
    setThemePreference,
    themeId,
    setThemeId,
    fontId,
    setFontId,
    showAccountMonthlyStats,
    setShowAccountMonthlyStats,
  } = ui;

  const handleSetThemePreference = useCallback(
    (value: 'system' | 'light' | 'dark') => {
      setThemePreference(value);
      analytics.trackFeatureUsage('settings', 'change_theme_preference', {
        preference: value,
      });
    },
    [setThemePreference],
  );

  const handleSetThemeId = useCallback(
    (value: ThemeId) => {
      setThemeId(value);
      analytics.trackFeatureUsage('settings', 'change_theme', {
        theme_id: value,
      });
    },
    [setThemeId],
  );

  const handleSetFontId = useCallback(
    (value: FontId) => {
      setFontId(value);
      analytics.trackFeatureUsage('settings', 'change_font', {
        font_id: value,
      });
    },
    [setFontId],
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
