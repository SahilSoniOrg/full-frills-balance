import { AppConfig } from '@/src/constants';
import type { Theme } from '@/src/constants/design-tokens';
import type { IconName } from '@/src/components/core';
import { resolveThemeColor } from '@/src/design-system/utils';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';

export type InsightDetailsRouteParams = {
  id?: string;
  message?: string;
  description?: string;
  suggestion?: string;
  severity?: string;
  amount?: string;
  currencyCode?: string;
  journalIds?: string;
};

export type InsightDetailsHeaderModel = {
  severityColor: string;
  severityLabel: string;
  iconName: IconName;
  message: string;
  amountText: string | null;
  description: string | null;
  suggestion: string;
  impactLabel: string;
  whyThisAppeared: string;
  recommendedActionLabel: string;
  basisText: string;
  transactionsTitle: string;
};

export function buildInsightDetailsHeader(
  params: InsightDetailsRouteParams,
  theme: Theme,
  isPrivacyMode: boolean,
): InsightDetailsHeaderModel {
  const strings = AppConfig.strings.dashboard.insightDetails;

  let baseColor = theme.primary;
  let severityLabel = strings.severityLabel.low;
  if (params.severity === 'high') {
    baseColor = theme.error;
    severityLabel = strings.severityLabel.high;
  } else if (params.severity === 'medium') {
    baseColor = theme.warning;
    severityLabel = strings.severityLabel.medium;
  }

  const severityColor = resolveThemeColor(theme, baseColor) as string;

  let amountText: string | null = null;
  if (params.amount) {
    const parsed = Number(params.amount);
    if (Number.isFinite(parsed)) {
      amountText = isPrivacyMode
        ? AppConfig.privacyMask
        : CurrencyFormatter.format(parsed, params.currencyCode ?? '');
    }
  }

  return {
    severityColor,
    severityLabel,
    iconName: params.id?.startsWith('sub_') ? 'refresh' : 'trendingUp',
    message: params.message ?? '',
    amountText,
    description: params.description ?? null,
    suggestion: params.suggestion ?? '',
    impactLabel: strings.impact,
    whyThisAppeared: strings.whyThisAppeared,
    recommendedActionLabel: strings.recommendedAction,
    basisText: strings.basisText(AppConfig.insights.lookbackDays),
    transactionsTitle: AppConfig.strings.dashboard.triggeringTransactionsTitle,
  };
}
