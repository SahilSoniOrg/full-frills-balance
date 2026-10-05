import { AppConfig } from '@/src/constants';
import { ColorKey } from '@/src/constants/design-tokens';
import { BudgetUsage } from '@/src/services/budget/types';

const BUDGET_NEAR_LIMIT_THRESHOLD = 0.8;
const BUDGET_PACE_TOLERANCE = 0.1;
export type BudgetStatus = 'over' | 'nearLimit' | 'aheadOfPace' | 'onPace';

export function resolveBudgetStatus(
  usagePercent: number,
  elapsedShare = 1,
): {
  status: BudgetStatus;
  statusColor: ColorKey;
  statusBadge: {
    variant: 'default' | 'error' | 'warning' | 'success';
    text: string;
  };
} {
  if (usagePercent >= 1) {
    return {
      status: 'over',
      statusColor: 'error',
      statusBadge: {
        variant: 'error',
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
        text: AppConfig.strings.budget.statusAheadOfPace,
      },
    };
  }

  return {
    status: 'onPace',
    statusColor: 'primary',
    statusBadge: {
      variant: 'success',
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
        text: AppConfig.strings.budget.incompleteStatus,
      }
    : resolvedStatus.statusBadge;
  const isOver = resolvedStatus.status === 'over';

  return {
    status: resolvedStatus.status,
    statusColor,
    statusBadge,
    isOver,
  };
}
