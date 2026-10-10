import { useState } from 'react';
import { AppButton, AppText, PressScaleTouchable, ListGroup } from '@/src/components/core';
import { BudgetProgressBar } from '@/src/components/budget/BudgetProgressBar';
import { ErrorStateView } from '@/src/components/shared/ErrorStateView';
import { useMoneyFormat } from '@/src/components/shared/moneyFormat';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { AppConfig, JOURNAL_DETAILS_LIMITS, Spacing } from '@/src/constants';
import { Inline, Stack } from '@/src/design-system';
import { AppNavigation } from '@/src/utils/navigation';
import type { JournalBudgetModel } from '../../journalDetailsPresentation';

export function JournalBudgetImpact({
  budget: { budgets, error, onRetry },
}: {
  budget: JournalBudgetModel;
}) {
  const [expanded, setExpanded] = useState(false);
  const formatMoney = useMoneyFormat();
  const privateMode = useEffectivePrivacyMode();
  const strings = AppConfig.strings.journalDetails;
  if (error)
    return (
      <ListGroup header={strings.budget} dividerInset="none">
        <ErrorStateView
          variant="inline"
          message={strings.budgetsUnavailable}
          retryLabel={strings.retry}
          onRetry={onRetry}
          style={{ padding: Spacing.lg }}
        />
      </ListGroup>
    );
  if (budgets.length === 0) return null;
  return (
    <ListGroup header={strings.budget} testID="journal-budget-impact" dividerInset="none">
      {(expanded ? budgets : budgets.slice(0, JOURNAL_DETAILS_LIMITS.budgetPreview)).map(budget => {
        const { usage } = budget;
        const over = usage.remaining < 0;
        const headline = usage.hasUnvaluedEntries
          ? strings.incompleteBudget
          : over
            ? strings.over(
                formatMoney(-usage.remaining, budget.currencyCode),
                formatMoney(usage.budgetAmount, budget.currencyCode),
              )
            : strings.left(
                formatMoney(usage.remaining, budget.currencyCode),
                formatMoney(usage.budgetAmount, budget.currencyCode),
              );
        return (
          <PressScaleTouchable
            key={budget.budgetId}
            onPress={() => AppNavigation.toBudgetDetail(budget.budgetId)}
            accessibilityRole="button"
            accessibilityLabel={`${budget.name}, ${headline}`}
          >
            <Stack space="xs" padding="md">
              <Inline
                space="sm"
                justifyContent="space-between"
                alignItems="baseline"
                flexWrap="wrap"
              >
                <AppText variant="body" weight="semibold">
                  {budget.name}
                </AppText>
                <AppText
                  variant="caption"
                  color={usage.hasUnvaluedEntries ? 'warning' : over ? 'error' : 'secondary'}
                  style={{ flexShrink: 1 }}
                >
                  {budget.periodLabel ? `${budget.periodLabel} · ` : ''}
                  {headline}
                </AppText>
              </Inline>
              {!usage.hasUnvaluedEntries ? (
                <BudgetProgressBar
                  progress={privateMode ? 0 : usage.usagePercent * 100}
                  statusColor={over ? 'error' : 'primary'}
                  accessibilityLabel={headline}
                />
              ) : null}
            </Stack>
          </PressScaleTouchable>
        );
      })}
      {!expanded && budgets.length > JOURNAL_DETAILS_LIMITS.budgetPreview ? (
        <AppButton variant="ghost" onPress={() => setExpanded(true)}>
          {strings.more(budgets.length - JOURNAL_DETAILS_LIMITS.budgetPreview)}
        </AppButton>
      ) : null}
    </ListGroup>
  );
}
