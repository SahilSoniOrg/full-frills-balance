import { FontId, ThemeId } from '@/src/constants/design-tokens';
import { useAccountDisplayPrefs } from '@/src/hooks/useAccountDisplayPrefs';
import { useHourCyclePrefs } from '@/src/hooks/useHourCyclePrefs';
import { useThemePrefs } from '@/src/hooks/useThemePrefs';
import { analytics } from '@/src/services/analytics';
import type { HourCyclePreference, ResolvedHourCycle } from '@/src/utils/hourCycle';
import { useCallback } from 'react';

export interface AppearanceSettingsViewModel {
  themePreference: 'system' | 'light' | 'dark';
  setThemePreference: (value: 'system' | 'light' | 'dark') => void;
  themeId: ThemeId;
  setThemeId: (value: ThemeId) => void;
  fontId: FontId;
  setFontId: (value: FontId) => void;
  hourCyclePreference: HourCyclePreference;
  resolvedHourCycle: ResolvedHourCycle;
  setHourCyclePreference: (value: HourCyclePreference) => void;
  showAccountMonthlyStats: boolean;
  onToggleAccountMonthlyStats: () => void;
  useCompactAccountPicker: boolean;
  onToggleCompactAccountPicker: () => void;
}

export function useAppearanceSettingsViewModel(): AppearanceSettingsViewModel {
  const { themePreference, setThemePreference, themeId, setThemeId, fontId, setFontId } =
    useThemePrefs();
  const { hourCyclePreference, resolvedHourCycle, setHourCyclePreference } = useHourCyclePrefs();
  const {
    showAccountMonthlyStats,
    setShowAccountMonthlyStats,
    useCompactAccountPicker,
    setUseCompactAccountPicker,
  } = useAccountDisplayPrefs();

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

  const onToggleCompactAccountPicker = useCallback(() => {
    setUseCompactAccountPicker(!useCompactAccountPicker);
    analytics.trackFeatureUsage('settings', 'toggle_compact_account_picker', {
      new_state: !useCompactAccountPicker,
    });
  }, [setUseCompactAccountPicker, useCompactAccountPicker]);

  const handleSetHourCyclePreference = useCallback(
    (value: HourCyclePreference) => {
      setHourCyclePreference(value);
      analytics.trackFeatureUsage('settings', 'change_hour_cycle', {
        preference: value,
      });
    },
    [setHourCyclePreference],
  );

  return {
    themePreference,
    setThemePreference: handleSetThemePreference,
    themeId,
    setThemeId: handleSetThemeId,
    fontId,
    setFontId: handleSetFontId,
    hourCyclePreference,
    resolvedHourCycle,
    setHourCyclePreference: handleSetHourCyclePreference,
    showAccountMonthlyStats,
    onToggleAccountMonthlyStats,
    useCompactAccountPicker,
    onToggleCompactAccountPicker,
  };
}
