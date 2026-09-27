import { Icon, type IconName } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import type { Insight } from '@/src/services/insight/insightTypes';

export interface InsightTypePresentation {
  icon: IconName;
  actionLabel: string;
  dismissible: boolean;
}

/** How each notification type looks and behaves in the Hub. */
export function insightTypePresentation(type: Insight['type']): InsightTypePresentation {
  const { strings } = AppConfig;
  switch (type) {
    case 'app-update':
      return { icon: Icon.TrendingUp, actionLabel: strings.update.updateNow, dismissible: true };
    case 'unbalanced-journals':
      return {
        icon: Icon.Scale,
        actionLabel: strings.dashboard.hub.reviewEntries,
        dismissible: false,
      };
    case 'subscription-amnesiac':
      return {
        icon: Icon.History,
        actionLabel: strings.journal.plannedPayments,
        dismissible: true,
      };
    case 'slow-leak':
      return {
        icon: Icon.TrendingUp,
        actionLabel: strings.reports.spendingBreakdown,
        dismissible: true,
      };
    case 'lifestyle-drift':
      return {
        icon: Icon.TrendingUp,
        actionLabel: strings.dashboard.notifications.planEmergencyFund,
        dismissible: true,
      };
    case 'phantom-surplus':
      return { icon: Icon.TrendingUp, actionLabel: strings.dashboard.hub.title, dismissible: true };
  }
}
