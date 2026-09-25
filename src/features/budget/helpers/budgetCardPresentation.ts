import { Icon, type IconName } from '@/src/types/domainIcons';
import { AppConfig } from '@/src/constants';
import { ColorKey } from '@/src/constants/design-tokens';
import { BudgetPeriodInput, BudgetPeriodUtils } from '@/src/services/budget/BudgetPeriodUtils';
import { BudgetUsage } from '@/src/services/budget/types';
import dayjs from 'dayjs';

export interface BudgetCardInput extends BudgetPeriodInput {
  name: string;
  amount: number;
  currencyCode: string;
}

export interface BudgetUsageViewModel {
  statusColor: ColorKey;
  statusBadge: {
    variant: 'default' | 'error' | 'warning' | 'success';
    icon: IconName;
    text: string;
  };
  spent: number;
  remaining: number;
  isOver: boolean;
  progress: number;
}

/** List-card header fields only — usage display lives in BudgetUsageSummary. */
export interface BudgetListCardViewModel {
  name: string;
  amount: number;
  currencyCode: string;
  periodSubtitle: string;
  statusColor: ColorKey;
  previousPeriodLabel?: string;
  previousPeriodColor: 'error' | 'success' | 'warning';
  previousPeriodIcon: IconName;
}

export function resolveBudgetStatus(usagePercent: number): {
  statusColor: ColorKey;
  statusBadge: BudgetUsageViewModel['statusBadge'];
} {
  if (usagePercent >= 1) {
    return {
      statusColor: 'error',
      statusBadge: {
        variant: 'error',
        icon: Icon.Alert,
        text: AppConfig.strings.budget.statusOverBudget,
      },
    };
  }

  if (usagePercent >= 0.8) {
    return {
      statusColor: 'warning',
      statusBadge: {
        variant: 'warning',
        icon: Icon.Clock,
        text: AppConfig.strings.budget.statusNearLimit,
      },
    };
  }

  return {
    statusColor: 'primary',
    statusBadge: {
      variant: 'success',
      icon: Icon.PieChart,
      text: AppConfig.strings.budget.statusOnTrack,
    },
  };
}

export function presentBudgetUsage(usage: BudgetUsage): BudgetUsageViewModel {
  const resolvedStatus = resolveBudgetStatus(usage.usagePercent);
  const statusColor = usage.hasUnvaluedEntries ? 'warning' : resolvedStatus.statusColor;
  const statusBadge = usage.hasUnvaluedEntries
    ? {
        variant: 'warning' as const,
        icon: Icon.Alert,
        text: AppConfig.strings.budget.incompleteStatus,
      }
    : resolvedStatus.statusBadge;
  const isOver = usage.remaining < 0;
  const progress = Math.min(100, Math.max(0, usage.usagePercent * 100));

  return {
    statusColor,
    statusBadge,
    spent: usage.spent,
    remaining: usage.remaining,
    isOver,
    progress,
  };
}

export function presentBudgetListCard(
  budget: BudgetCardInput,
  usage: BudgetUsage,
  previousUsage: BudgetUsage | undefined,
): BudgetListCardViewModel {
  const { statusColor } = presentBudgetUsage(usage);

  const { endDate } = BudgetPeriodUtils.getCurrentPeriod(budget);
  const daysLeft = Math.max(0, dayjs(endDate).diff(dayjs(), 'day'));
  const periodLabel = BudgetPeriodUtils.getPeriodLabel(budget);
  const daysLeftLabel =
    daysLeft === 0
      ? AppConfig.strings.budget.endsToday
      : AppConfig.strings.budget.daysLeft(daysLeft);

  let previousPeriodLabel: string | undefined;
  let previousPeriodColor: 'error' | 'success' | 'warning' = 'success';
  let previousPeriodIcon: IconName = Icon.TrendingUp;

  if (previousUsage) {
    if (previousUsage.hasUnvaluedEntries) {
      previousPeriodLabel = AppConfig.strings.budget.incompleteStatus;
      previousPeriodColor = 'warning';
      previousPeriodIcon = Icon.Alert;
    } else {
      const wasOver = previousUsage.remaining < 0;
      previousPeriodLabel = wasOver
        ? AppConfig.strings.budget.overLastPeriod
        : AppConfig.strings.budget.underLastPeriod;
      previousPeriodColor = wasOver ? 'error' : 'success';
      previousPeriodIcon = wasOver ? Icon.TrendingDown : Icon.TrendingUp;
    }
  }

  return {
    name: budget.name,
    amount: budget.amount,
    currencyCode: budget.currencyCode,
    periodSubtitle: `${daysLeftLabel} • ${periodLabel}`,
    statusColor,
    previousPeriodLabel,
    previousPeriodColor,
    previousPeriodIcon,
  };
}
