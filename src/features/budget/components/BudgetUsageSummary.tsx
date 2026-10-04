import { useMoneyFormat } from '@/src/components/shared/moneyFormat';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { AppText, AppIcon, Icon } from '@/src/components/core';
import { AppConfig, Size } from '@/src/constants';
import { Column, Row } from '@/src/design-system';
import { presentBudgetUsage } from '@/src/features/budget/helpers/budgetCardPresentation';
import { BudgetUsage } from '@/src/services/budget/types';
import { BudgetProgressBar } from '@/src/components/budget/BudgetProgressBar';
import { IncompleteFxWarning } from '@/src/components/shared/IncompleteFxWarning';
import { showIncompleteFxDetails } from '@/src/utils/incompleteFxDetails';

interface BudgetUsageSummaryProps {
  usage: BudgetUsage;
  currencyCode: string;
  /** List card uses inline amounts; detail gives remaining money emphasis. */
  variant?: 'card' | 'detail';
}

export function BudgetUsageSummary({
  usage,
  currencyCode,
  variant = 'detail',
}: BudgetUsageSummaryProps) {
  const formatMoney = useMoneyFormat({ style: 'compact' });
  const { statusColor, isOver, progress, spent, remaining } = presentBudgetUsage(usage);

  const spentLabel = AppConfig.strings.budget.spentLabel;
  const remainingLabel = isOver
    ? AppConfig.strings.budget.overLimitLabel
    : AppConfig.strings.budget.remainingLabel;

  if (variant === 'card') {
    return (
      <Column gap="xs">
        <Row justify="space-between" align="baseline" gap="sm" flexWrap="wrap">
          <Row align="center" gap="xs">
            <AppIcon name={Icon.Receipt} size={Size.iconXs} color="textSecondary" />
            <AppText variant="caption" color="secondary">
              {formatMoney(spent, currencyCode)}
            </AppText>
          </Row>
          <AppText variant="body" weight="semibold" color={isOver ? 'error' : 'text'}>
            {formatMoney(Math.abs(remaining), currencyCode)} {isOver ? 'over' : 'left'}
          </AppText>
        </Row>

        <BudgetProgressBar progress={progress} statusColor={statusColor} size="sm" />
        {usage.hasUnvaluedEntries ? (
          <IncompleteFxWarning
            message={AppConfig.strings.budget.incompleteFxWarning}
            onPress={() => showIncompleteFxDetails({ context: 'budget', currencyCode })}
          />
        ) : null}
      </Column>
    );
  }

  return (
    <Column gap="md">
      <Column gap="xs">
        <AppText variant="caption" color="secondary">
          {remainingLabel}
        </AppText>
        <MoneyText
          amount={Math.abs(remaining)}
          currencyCode={currencyCode}
          variant="title"
          color={isOver ? 'error' : 'text'}
        />
      </Column>
      <BudgetProgressBar progress={progress} statusColor={statusColor} size="md" />
      <Row justify="space-between" align="flex-start" gap="md" flexWrap="wrap">
        <Column gap="xs" flexGrow={1} flexBasis={120}>
          <AppText variant="caption" color="secondary">
            {spentLabel}
          </AppText>
          <MoneyText amount={spent} currencyCode={currencyCode} variant="subheading" />
        </Column>

        <Column gap="xs" flexGrow={1} flexBasis={120}>
          <AppText variant="caption" color="secondary">
            Period limit
          </AppText>
          <MoneyText amount={usage.budgetAmount} currencyCode={currencyCode} variant="subheading" />
        </Column>
      </Row>
      {usage.hasUnvaluedEntries ? (
        <IncompleteFxWarning
          message={AppConfig.strings.budget.incompleteFxWarning}
          onPress={() => showIncompleteFxDetails({ context: 'budget', currencyCode })}
        />
      ) : null}
    </Column>
  );
}
