import { AppConfig } from '@/src/constants';
import { useUI } from '@/src/contexts/UIContext';
import { useTheme } from '@/src/hooks/use-theme';
import { useObservable } from '@/src/hooks/useObservable';
import { notificationService } from '@/src/services/notification/NotificationService';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import React from 'react';
import { Platform } from 'react-native';

// Use the types from the module
import type {
  WidgetDataSnapshot,
  WidgetThemeSnapshot,
} from '@/modules/expo-widgets/src/ExpoWidgets.types';

function clampChannel(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function normalizeHexColor(color: string) {
  const sanitized = color.trim().replace('#', '');
  if (sanitized.length === 3) {
    return `#${sanitized
      .split('')
      .map(char => char + char)
      .join('')
      .toUpperCase()}`;
  }
  if (sanitized.length === 6) {
    return `#${sanitized.toUpperCase()}`;
  }
  return '#FFFFFF';
}

function parseHexColor(color: string) {
  const normalized = normalizeHexColor(color).slice(1);
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function toHexColor({ r, g, b }: { r: number; g: number; b: number }) {
  return `#${[r, g, b]
    .map(channel => clampChannel(channel).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

function mixHexColors(base: string, overlay: string, overlayWeight: number) {
  const safeWeight = Math.max(0, Math.min(1, overlayWeight));
  const baseRgb = parseHexColor(base);
  const overlayRgb = parseHexColor(overlay);

  return toHexColor({
    r: baseRgb.r * (1 - safeWeight) + overlayRgb.r * safeWeight,
    g: baseRgb.g * (1 - safeWeight) + overlayRgb.g * safeWeight,
    b: baseRgb.b * (1 - safeWeight) + overlayRgb.b * safeWeight,
  });
}

function buildWidgetThemeSnapshot(
  themeId: string,
  themeMode: 'light' | 'dark',
  theme: any, // Using any for theme object for now to match RootLayout's usage, but ideally should be typed
): WidgetThemeSnapshot {
  const backgroundStartColor = normalizeHexColor(theme.surface);
  const backgroundEndColor =
    themeMode === 'dark'
      ? mixHexColors(theme.surface, theme.primary, 0.22)
      : mixHexColors(theme.surface, theme.primaryLight, 0.16);

  return {
    themeId,
    themeMode,
    backgroundStartColor,
    backgroundEndColor,
    titleColor: normalizeHexColor(theme.primary),
    primaryTextColor: normalizeHexColor(theme.text),
    secondaryTextColor: normalizeHexColor(theme.textSecondary),
    actionIconColor: normalizeHexColor(theme.primary),
    incomeAccentColor: mixHexColors(theme.income, theme.pure, themeMode === 'dark' ? 0.28 : 0.82),
    expenseAccentColor: mixHexColors(theme.expense, theme.pure, themeMode === 'dark' ? 0.28 : 0.82),
    transferAccentColor: mixHexColors(
      theme.transfer,
      theme.pure,
      themeMode === 'dark' ? 0.24 : 0.84,
    ),
  };
}

export function useWidgetSync(workplaceId: string) {
  const { themeId, isWidgetPrivacyEnabled, isAppCurrentlyLocked } = useUI();
  const { theme, themeMode } = useTheme();
  const { data: safeToSpendData } = useObservable(
    () => notificationService.observeSafeToSpend(workplaceId),
    [workplaceId],
    null,
  );

  const safeToSpend = safeToSpendData?.summary.safeToSpend;
  const shortfall = safeToSpendData?.summary.shortfall;
  const trajectoryMinBalance = safeToSpendData?.summary.trajectoryMinBalance;
  const firstMajorInflowDayFromData = safeToSpendData?.summary.firstMajorInflowDay;
  const rawCurrencyCode = safeToSpendData?.currencyCode;

  // Bulletproof data presence check: ensure both summary and currency exist
  const isDataPresent = !!safeToSpendData?.summary && !!rawCurrencyCode;
  const currencyCode = rawCurrencyCode || AppConfig.defaultCurrency;

  React.useEffect(() => {
    if (Platform.OS === 'web' || isAppCurrentlyLocked) {
      return;
    }

    const bootstrapWidgets = async () => {
      // Lazy load the module to avoid issues during bootstrap
      const expoWidgetsModule = (await import('@/modules/expo-widgets')).default;

      const isShortfall = (shortfall ?? 0) > 0;
      const displayAmount = isShortfall ? (shortfall ?? 0) : (safeToSpend ?? 0);

      const snapshot: WidgetDataSnapshot = {
        safeToSpend: isDataPresent
          ? {
              amount: displayAmount,
              currencyCode,
              formattedAmount: CurrencyFormatter.format(displayAmount, currencyCode, {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              }),
              title: isShortfall
                ? AppConfig.strings.dashboard.shortfall
                : AppConfig.strings.dashboard.safeToSpendTitle,
              subtitle: isShortfall
                ? AppConfig.strings.dashboard.neededForObligations
                : AppConfig.strings.dashboard.afterObligations,
              updatedAt: Date.now(),
            }
          : undefined,
        theme: buildWidgetThemeSnapshot(themeId, themeMode, theme),
        isPrivacyEnabled: isWidgetPrivacyEnabled,
      };

      await expoWidgetsModule.syncWidgetData(snapshot).catch((err: any) => {
        console.warn('[useWidgetSync] Failed to sync widget data:', err);
      });
    };

    // Use a small timeout to debounce rapid changes (e.g. during batch operations)
    const timeoutId = setTimeout(() => {
      void bootstrapWidgets();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [
    theme,
    theme.expense,
    theme.income,
    theme.primary,
    theme.primaryLight,
    theme.pure,
    theme.surface,
    theme.text,
    theme.textSecondary,
    theme.transfer,
    themeId,
    themeMode,
    isWidgetPrivacyEnabled,
    isAppCurrentlyLocked,
    safeToSpend,
    shortfall,
    trajectoryMinBalance,
    firstMajorInflowDayFromData,
    currencyCode,
    isDataPresent,
  ]);
}
