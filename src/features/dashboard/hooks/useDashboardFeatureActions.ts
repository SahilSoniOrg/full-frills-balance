import { analytics } from '@/src/services/analytics-service';
import { AccountId, PlannedPaymentId } from '@/src/types/domain';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback } from 'react';

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

  return {
    openJournalEntry,
    openAccount,
    openPlannedPayment,
    trackChartPoint,
    trackLegendToExplanation,
  };
}
