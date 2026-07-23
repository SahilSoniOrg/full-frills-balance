import { AppConfig } from '@/src/constants';
import { Theme } from '@/src/constants/design-tokens';
import { useUI } from '@/src/contexts/UIContext';
import { useTheme } from '@/src/hooks/use-theme';
import { useObservable } from '@/src/hooks/useObservable';
import {
  notificationService,
  SafeToSpendResult,
} from '@/src/services/notification/NotificationService';
import { widgetSyncObserver } from '@/src/services/widget/WidgetSyncObserver';
import { FinancialPetService } from '@/src/services/FinancialPetService';
import type { WidgetPayload } from '@/src/services/widget/WidgetPayload';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { logger } from '@/src/utils/logger';
import React from 'react';
import { Platform } from 'react-native';
import { EMPTY } from 'rxjs';

import { WorkplaceId } from '@/src/types/domain';
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
  const { themeId, isWidgetPrivacyEnabled, isAppCurrentlyLocked, isAppReady } = useUI();
  const { theme, themeMode } = useTheme();

  // Ensure observer is started in production when widget sync is active
  React.useEffect(() => {
    if (workplaceId) {
      widgetSyncObserver.start(workplaceId);
    }
  }, [workplaceId]);

  // Subscribe to the observer's payload$ (streak, pendingSms, pet data from DB)
  const { data: observerPayload } = useObservable<WidgetPayload | null>(
    () => widgetSyncObserver.payload$,
    [],
    null,
  );

  // Delay safeToSpend calculation until the app is ready to avoid blocking hydration.
  // This hook remains the sole bridge writer — it merges all data sources here.
  const { data: safeToSpendData } = useObservable<SafeToSpendResult | null>(
    () =>
      isAppReady ? notificationService.observeSafeToSpend(workplaceId, defaultCurrencyCode) : EMPTY,
    [workplaceId, defaultCurrencyCode, isAppReady],
    null,
  );

  const safeToSpend = safeToSpendData?.summary.safeToSpend;
  const shortfall = safeToSpendData?.summary.shortfall;
  const trajectoryMinBalance = safeToSpendData?.summary.trajectoryMinBalance;
  const firstMajorInflowDayFromData = safeToSpendData?.summary.firstMajorInflowDay;
  const rawCurrencyCode = safeToSpendData?.currencyCode;

  // Bulletproof data presence check: ensure both summary and currency exist
  const isDataPresent = !!safeToSpendData?.summary && !!rawCurrencyCode;
  const currencyCode = rawCurrencyCode || defaultCurrencyCode;

  React.useEffect(() => {
    if (Platform.OS === 'web' || isAppCurrentlyLocked || !isAppReady) {
      return;
    }

    const bootstrapWidgets = async () => {
      // Lazy load the module to avoid issues during bootstrap using require
      const expoWidgetsModule = require('@/modules/expo-widgets').default;

      const isShortfall = (shortfall ?? 0) > 0;
      const displayAmount = isShortfall ? (shortfall ?? 0) : (safeToSpend ?? 0);
      const budgetMarginRatio = isShortfall ? 0.0 : 1.0;

      // Compute pet payload per spec: Audit Deficit (pending inbox) + Budget Health
      const petCalculated = observerPayload?.pet
        ? FinancialPetService.calculatePetPayload(
            observerPayload.pet.unreviewedCount,
            budgetMarginRatio,
          )
        : null;

      // Build the complete snapshot merging observer data (streak/pet/sms)
      // with the hook-owned data (safeToSpend, theme, privacy).
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

        // Streak — mapped from observer payload to bridge shape
        streak: observerPayload?.streak
          ? {
              count: observerPayload.streak.streakCount,
              todayLogged: observerPayload.streak.todayLogged,
              lastLoggedDate: observerPayload.streak.lastLoggedDate,
              canRecover: observerPayload.streak.canRecoverMissedDays,
              missedDays: observerPayload.streak.missedDaysCount,
            }
          : undefined,

        // PendingSms — observer returns single latest item; bridge expects array
        pendingSms: observerPayload?.pendingSms
          ? [
              {
                id: observerPayload.pendingSms.id,
                merchant: observerPayload.pendingSms.merchant ?? '',
                amount: observerPayload.pendingSms.amount,
                currency: observerPayload.pendingSms.currency,
              },
            ]
          : undefined,

        // Pet — health computed per spec from Audit Deficit + Budget Health
        pet: petCalculated
          ? {
              health: petCalculated.petHealth,
              mood: petCalculated.petMood,
            }
          : undefined,
      };

      await expoWidgetsModule.syncWidgetData(snapshot).catch((err: Error | unknown) => {
        logger.warn('[useWidgetSync] Failed to sync widget data', { error: String(err) });
      });
    };

    // Use a small timeout to debounce rapid changes and decouple write from UI thread
    const timeoutId = setTimeout(() => {
      void bootstrapWidgets();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [
    theme,
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
    observerPayload,
  ]);
}
