import { analytics } from '@/src/services/analytics';
import { AccountId, PlannedPaymentId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback } from 'react';

interface GlobalBootState {
  __BOOT_START_TIME__?: number;
  __HAS_MOUNTED_BEFORE__?: boolean;
}

/** Dashboard-owned first-paint metric. Call once from DashboardScreen. */
export function trackDashboardFirstPaint() {
  const globalState = globalThis as unknown as GlobalBootState;
  const startTime = globalState.__BOOT_START_TIME__;
  if (!startTime) return;
  const duration = performance.now() - startTime;
  const isColdBoot = !globalState.__HAS_MOUNTED_BEFORE__;
  globalState.__HAS_MOUNTED_BEFORE__ = true;
  analytics.track('first_paint', {
    duration_ms: Math.round(duration),
    is_cold_boot: isColdBoot,
  });
  logger.info(`[Performance] First Paint: ${Math.round(duration)}ms (Cold: ${isColdBoot})`);
  globalState.__BOOT_START_TIME__ = undefined;
}

/** Dashboard-owned telemetry and navigation for Safe-to-Spend and the tab FAB. */
export function useDashboardFeatureActions() {
  const openJournalEntry = useCallback(() => {
    analytics.logEntrypointOpened('dashboard', 'bottom_action');
    analytics.logEntrypointSelected('dashboard', 'bottom_action', 'journal_entry');
    AppNavigation.toJournalEntry();
  }, []);

  const openAccount = useCallback(
    (
      account: {
        accountId: AccountId;
        accountName: string;
        startingBalance: number;
        color?: string;
      },
      currencyCode: string,
    ) => {
      analytics.trackFeatureUsage('safe_to_spend', 'account_viewed', { id: account.accountId });
      AppNavigation.toAccountDetails(account.accountId, {
        preview: {
          name: account.accountName,
          balance: account.startingBalance,
          currency: currencyCode,
          colorKey: account.color,
        },
      });
    },
    [],
  );

  const openPlannedPayment = useCallback((id: PlannedPaymentId | string, source: string) => {
    analytics.trackFeatureUsage('safe_to_spend', 'planned_payment_viewed', { id, source });
    AppNavigation.toPlannedPaymentDetails(id as PlannedPaymentId);
  }, []);

  const trackChartPoint = useCallback(
    (point: { dayOffset: number; isHistory: boolean; hasDetails: boolean }) => {
      analytics.trackFeatureUsage('safe_to_spend', 'chart_point_selected', point);
    },
    [],
  );

  const trackLegendToExplanation = useCallback((slice: 'safe' | 'committed' | 'debts') => {
    analytics.trackFeatureUsage('safe_to_spend', 'legend_to_explanation', { slice });
  }, []);

  const trackInfoVisible = useCallback((visible: boolean, isOverCommitted?: boolean) => {
    if (visible) {
      analytics.trackFeatureUsage('safe_to_spend', 'opened', { isOverCommitted });
    } else {
      analytics.trackFeatureUsage('safe_to_spend', 'closed');
    }
  }, []);

  const trackSectionExpanded = useCallback(
    (section: 'assets' | 'income' | 'committed' | 'debts') => {
      analytics.trackFeatureUsage('safe_to_spend', 'section_expanded', { section });
    },
    [],
  );

  const trackLegendPressed = useCallback((item: 'safe' | 'committed' | 'debts') => {
    analytics.trackFeatureUsage('safe_to_spend', 'legend_pressed', { item });
  }, []);

  const trackExplanationVisible = useCallback((visible: boolean) => {
    if (visible) analytics.logChartInteracted('safe_to_spend', 'explanation_open');
  }, []);

  const trackExplanationSection = useCallback(
    (section: 'assets' | 'income' | 'committed' | 'debts') => {
      analytics.logChartInteracted('safe_to_spend', `explanation_expand_${section}`);
    },
    [],
  );

  return {
    openJournalEntry,
    openAccount,
    openPlannedPayment,
    trackChartPoint,
    trackLegendToExplanation,
    trackInfoVisible,
    trackSectionExpanded,
    trackLegendPressed,
    trackExplanationVisible,
    trackExplanationSection,
  };
}
