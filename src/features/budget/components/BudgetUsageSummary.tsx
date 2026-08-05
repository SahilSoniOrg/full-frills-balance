import { useMoneyFormat } from '@/src/components/common/moneyFormat';
import { MoneyText } from '@/src/components/common/MoneyText';
import { AppIcon, AppText } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { Box, Column, Row } from '@/src/design-system';
import { presentBudgetUsage } from '@/src/features/budget/helpers/budgetCardPresentation';
import { BudgetUsage } from '@/src/services/budget/budgetReadService';
import { useTheme } from '@/src/hooks/use-theme';
import { BudgetProgressBar } from './BudgetProgressBar';

interface BudgetUsageSummaryProps {
  usage: BudgetUsage;
  currencyCode: string;
  /** List card uses a compact remaining pill; detail uses a two-column layout. */
  variant?: 'card' | 'detail';
}

export function BudgetUsageSummary({
  usage,
  currencyCode,
  variant = 'detail',
}: BudgetUsageSummaryProps) {
  const { theme } = useTheme();
  const formatMoney = useMoneyFormat({ style: 'compact' });
  const { statusColor, isOver, progress, spent, remaining } = presentBudgetUsage(usage);

  const spentLabel = AppConfig.strings.budget.spentLabel;
  const remainingLabel = isOver
    ? AppConfig.strings.budget.overLimitLabel
    : AppConfig.strings.budget.remainingLabel;

  if (variant === 'card') {
    return (
      <Column gap="sm">
        <Row justify="space-between" align="flex-end" gap="md">
          <Column gap="xs" flex={1} style={{ minWidth: 0 }}>
            <AppText
              variant="caption"
              color="secondary"
              weight="bold"
              style={{ letterSpacing: 0.5 }}
            >
              {spentLabel.toUpperCase()}
            </AppText>
            <MoneyText
              amount={spent}
              currencyCode={currencyCode}
              formatStyle="compact"
              variant="subheading"
            />
          </Column>

          <Box
            background={isOver ? 'error' : 'success'}
            backgroundOpacity="soft"
            paddingHorizontal="sm"
            paddingVertical="xs"
            borderRadius="sm"
            style={{ flexShrink: 1, alignSelf: 'flex-end' }}
          >
            <Row align="center" gap="xs" flexShrink={1}>
              {isOver && <AppIcon name="alert" size={12} color={theme.error} />}
              <AppText
                variant="caption"
                weight="bold"
                color={isOver ? 'error' : 'success'}
                numberOfLines={2}
              >
                {remainingLabel.toUpperCase()}: {formatMoney(Math.abs(remaining), currencyCode)}
              </AppText>
            </Row>
          </Box>
        </Row>

        <BudgetProgressBar progress={progress} statusColor={statusColor} size="md" />
      </Column>
    );
  }

  return (
    <Column gap="md">
      <Row justify="space-between" align="flex-end">
        <Column gap="xs">
          <AppText variant="caption" color="secondary">
            {spentLabel}
          </AppText>
          <MoneyText
            amount={spent}
            currencyCode={currencyCode}
            formatStyle="compact"
            variant="subheading"
          />
        </Column>

        <Column align="flex-end" gap="xs">
          <AppText variant="caption" color="secondary">
            {remainingLabel}
          </AppText>
          <Row align="center" gap="xs">
            {isOver && <AppIcon name="alert" size={14} color={theme.error} />}
            <MoneyText
              amount={Math.abs(remaining)}
              currencyCode={currencyCode}
              formatStyle="compact"
              variant="subheading"
              color={isOver ? 'error' : 'success'}
            />
          </Row>
        </Column>
      </Row>

      <BudgetProgressBar progress={progress} statusColor={statusColor} />
    </Column>
  );
}
