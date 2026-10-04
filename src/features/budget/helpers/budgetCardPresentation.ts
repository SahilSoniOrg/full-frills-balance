import { Icon, type IconName } from '@/src/types/domainIcons';
import { AppConfig } from '@/src/constants';
import { ColorKey } from '@/src/constants/design-tokens';
import { BudgetUsage } from '@/src/services/budget/types';

export const BUDGET_NEAR_LIMIT_THRESHOLD = 0.8;
export const BUDGET_PACE_TOLERANCE = 0.1;
export type BudgetStatus = 'over' | 'nearLimit' | 'aheadOfPace' | 'onPace';

export function resolveBudgetStatus(
  usagePercent: number,
  elapsedShare = 1,
): {
  status: BudgetStatus;
  statusColor: ColorKey;
  statusBadge: {
    variant: 'default' | 'error' | 'warning' | 'success';
    icon: IconName;
    text: string;
  };
} {
  if (usagePercent >= 1) {
    return {
      status: 'over',
      statusColor: 'error',
      statusBadge: {
        variant: 'error',
        icon: Icon.Alert,
        text: AppConfig.strings.budget.statusOverBudget,
      },
    };
  }

  if (usagePercent >= BUDGET_NEAR_LIMIT_THRESHOLD) {
    return {
      status: 'nearLimit',
      statusColor: 'warning',
      statusBadge: {
        variant: 'warning',
        icon: Icon.Clock,
        text: AppConfig.strings.budget.statusNearLimit,
      },
    };
  }

  if (usagePercent > Math.min(1, Math.max(0, elapsedShare)) + BUDGET_PACE_TOLERANCE) {
    return {
      status: 'aheadOfPace',
      statusColor: 'warning',
      statusBadge: {
        variant: 'warning',
        icon: Icon.Clock,
        text: AppConfig.strings.budget.statusAheadOfPace,
      },
    };
  }

  return {
    status: 'onPace',
    statusColor: 'primary',
    statusBadge: {
      variant: 'success',
      icon: Icon.PieChart,
      text: AppConfig.strings.budget.statusOnTrack,
    },
  };
}

export function presentBudgetUsage(usage: BudgetUsage, elapsedShare = 1) {
  const resolvedStatus = resolveBudgetStatus(usage.usagePercent, elapsedShare);
  const statusColor = usage.hasUnvaluedEntries ? 'warning' : resolvedStatus.statusColor;
  const statusBadge = usage.hasUnvaluedEntries
    ? {
        variant: 'warning' as const,
        icon: Icon.Alert,
        text: AppConfig.strings.budget.incompleteStatus,
      }
    : resolvedStatus.statusBadge;
  const isOver = resolvedStatus.status === 'over';
  const progress = Math.min(100, Math.max(0, usage.usagePercent * 100));

  return {
    status: resolvedStatus.status,
    statusColor,
    statusBadge,
    spent: usage.spent,
    remaining: usage.remaining,
    isOver,
    progress,
  };
}
