import { AppConfig } from '@/src/constants';
import { Theme } from '@/src/constants/design-tokens';
import { useAppLock } from '@/src/contexts/app-shell/AppLockProvider';
import { useAppReady } from '@/src/contexts/app-shell/appReady';
import { usePrivacyPrefs } from '@/src/hooks/usePrivacyPrefs';
import { useThemePrefs } from '@/src/hooks/useThemePrefs';
import { useTheme } from '@/src/hooks/use-theme';
import { useObservable } from '@/src/hooks/useObservable';
import {
  safeToSpendReadModel,
  SafeToSpendHeadline,
} from '@/src/services/simulation/SafeToSpendReadModel';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import React from 'react';
import { logger } from '@/src/utils/logger';
import { Platform } from 'react-native';
import { EMPTY } from 'rxjs';

// Use the types from the module
import { WorkplaceId } from '@/src/types/ids';
import type {
  WidgetDataSnapshot,
  WidgetThemeSnapshot,
} from '@/modules/expo-widgets/src/ExpoWidgets.types';
import { LatestGenerationCoordinator } from './latestGeneration';
import { loadWidgetModule } from './loadWidgetModule';

const widgetSyncCoordinator = new LatestGenerationCoordinator();

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
  theme: Theme,
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

export function useWidgetSync(workplaceId: WorkplaceId, defaultCurrencyCode: string) {
  const { themeId } = useThemePrefs();
  const { isWidgetPrivacyEnabled } = usePrivacyPrefs();
  const { isAppCurrentlyLocked } = useAppLock();
  const { isAppReady } = useAppReady();
  const { theme, themeMode } = useTheme();

  // Delay safeToSpend calculation until the app is ready to avoid blocking hydration
  const { data: headline } = useObservable<SafeToSpendHeadline | null>(
    () => (isAppReady ? safeToSpendReadModel.forWorkplace(workplaceId).watchHeadline() : EMPTY),
    [workplaceId, isAppReady],
    null,
  );

  const safeToSpend = headline?.safeToSpend;
  const shortfall = headline?.shortfall;
  const trajectoryMinBalance = headline?.trajectoryMinBalance;
  const firstMajorInflowDayFromData = headline?.firstMajorInflowDay;
  const rawCurrencyCode = headline?.currencyCode;

  // Bulletproof data presence check: ensure both headline and currency exist
  const isDataPresent = !!headline && !!rawCurrencyCode;
  const currencyCode = rawCurrencyCode || defaultCurrencyCode;

  React.useEffect(() => {
    const lease = widgetSyncCoordinator.begin();

    if (Platform.OS === 'web' || isAppCurrentlyLocked || !isAppReady) {
      return () => lease.cancel();
    }

    const bootstrapWidgets = async () => {
      // Lazy load the native module to avoid touching it during web/bootstrap paths.
      const expoWidgetsModule = await loadWidgetModule();
      if (!lease.isCurrent()) return;

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
                ? AppConfig.strings.dashboard.shortfallSubtitle
                : AppConfig.strings.dashboard.afterObligations,
              updatedAt: Date.now(),
            }
          : undefined,
        theme: buildWidgetThemeSnapshot(themeId, themeMode, theme),
        isPrivacyEnabled: isWidgetPrivacyEnabled,
      };

      await lease.runSerialized(() => expoWidgetsModule.syncWidgetData(snapshot));
    };

    // Use a small timeout to debounce rapid changes (e.g. during batch operations)
    const timeoutId = setTimeout(() => {
      void bootstrapWidgets().catch((err: Error | unknown) => {
        if (lease.isCurrent()) {
          logger.warn('[useWidgetSync] Failed to sync widget data:', { error: err });
        }
      });
    }, 500);

    return () => {
      lease.cancel();
      clearTimeout(timeoutId);
    };
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
    isAppReady,
    workplaceId,
  ]);
}
