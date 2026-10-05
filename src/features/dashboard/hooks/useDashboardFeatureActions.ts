import { analytics } from '@/src/services/analytics';
import { AccountId, PlannedPaymentId } from '@/src/types/ids';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback } from 'react';

type SafeToSpendFeatureAction =
  | 'opened'
  | 'closed'
  | 'section_expanded'
  | 'legend_pressed'
  | 'chart_point_selected'
  | 'planned_payment_viewed'
  | 'account_viewed'
  | 'legend_to_explanation'
  | 'explanation_open'
  | 'explanation_section_expand';

function trackSts(
  action: SafeToSpendFeatureAction,
  props?: Parameters<typeof analytics.trackFeatureUsage>[2],
) {
  analytics.trackFeatureUsage('safe_to_spend', action, props);
}

/** Dashboard-owned telemetry and navigation for Safe-to-Spend. */
export function useDashboardFeatureActions() {
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
      trackSts('account_viewed', { id: account.accountId });
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
    trackSts('planned_payment_viewed', { id, source });
    AppNavigation.toPlannedPaymentDetails(id as PlannedPaymentId);
  }, []);

  const trackChartPoint = useCallback(
    (point: { dayOffset: number; isHistory: boolean; hasDetails: boolean }) => {
      trackSts('chart_point_selected', point);
    },
    [],
  );

  const trackLegendToExplanation = useCallback((slice: 'safe' | 'committed' | 'debts') => {
    trackSts('legend_to_explanation', { slice });
  }, []);

  const trackInfoVisible = useCallback((visible: boolean, isOverCommitted?: boolean) => {
    if (visible) {
      trackSts('opened', { isOverCommitted });
    } else {
      trackSts('closed');
    }
  }, []);

  const trackSectionExpanded = useCallback(
    (section: 'assets' | 'income' | 'committed' | 'debts') => {
      trackSts('section_expanded', { section });
    },
    [],
  );

  const trackLegendPressed = useCallback((item: 'safe' | 'committed' | 'debts') => {
    trackSts('legend_pressed', { item });
  }, []);

  const trackExplanationVisible = useCallback((visible: boolean) => {
    if (visible) trackSts('explanation_open');
  }, []);

  const trackExplanationSection = useCallback(
    (section: 'assets' | 'income' | 'committed' | 'debts') => {
      trackSts('explanation_section_expand', { section });
    },
    [],
  );

  return {
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
