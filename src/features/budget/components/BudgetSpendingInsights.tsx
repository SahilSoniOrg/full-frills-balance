import { AccountInlineLabel } from '@/src/components/accounts/AccountInlineLabel';
import { AppButton, AppText } from '@/src/components/core';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { AppConfig, Shape, Spacing } from '@/src/constants';
import { Column, Row } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { resolveLeafExpenseAccountIds } from '@/src/services/budget/budgetCalculationHelpers';
import type { BudgetCumulativeChart } from '@/src/services/budget/budgetCumulativeChartService';
import type { AccountId, WorkplaceId } from '@/src/types/ids';
import type { PlainAccount } from '@/src/types/plainDtos';
import { StyleSheet, View } from 'react-native';

interface Props {
  chartData: BudgetCumulativeChart | null;
  isLoading: boolean;
  error?: string;
  onRetry?: () => void;
  currencyCode: string;
  expenseAccounts: PlainAccount[];
  scopeAccounts: PlainAccount[];
  onFilterCategory: (id: AccountId | null) => void;
  activityCategory: PlainAccount | null;
  workplaceId: WorkplaceId;
}

export function BudgetSpendingInsights({
  chartData,
  isLoading,
  error,
  onRetry,
  currencyCode,
  expenseAccounts,
  scopeAccounts,
  onFilterCategory,
  activityCategory,
  workplaceId,
}: Props) {
  const { theme } = useTheme();
  const strings = AppConfig.strings.budgetDetailRedesign;
  const categories = chartData?.categories ?? [];
  const resolvedCategoryCount = resolveLeafExpenseAccountIds(
    scopeAccounts,
    expenseAccounts,
    workplaceId,
  ).size;
  const totalCategorySpend = categories.reduce((total, category) => total + category.spent, 0);

  if (resolvedCategoryCount === 1) return null;

  return (
    <Column gap="sm">
      <Row align="baseline" justify="space-between" gap="sm" flexWrap="wrap">
        <AppText variant="heading" weight="semibold">
          {strings.whereItWent}
        </AppText>
      </Row>

      {isLoading ? (
        <AppText variant="caption" color="secondary">
          {AppConfig.strings.common.loading}
        </AppText>
      ) : error ? (
        <View style={styles.errorState}>
          <AppText variant="caption" color="warning">
            {error}
          </AppText>
          <AppButton
            variant="secondary"
            onPress={onRetry}
            accessibilityLabel={strings.retryBreakdown}
          >
            {strings.retryBreakdown}
          </AppButton>
        </View>
      ) : categories.length === 0 ? (
        <AppText variant="caption" color="secondary">
          {strings.noCategorySpending}
        </AppText>
      ) : (
        <Column gap="xs">
          {categories.map(category => {
            const account = expenseAccounts.find(item => item.id === category.accountId);
            const selected = activityCategory?.id === category.accountId;
            const share =
              totalCategorySpend > 0
                ? Math.min(1, Math.max(0, category.spent / totalCategorySpend))
                : 0;
            const width = `${share * 100}%` as `${number}%`;
            const accessibleName = account?.name ?? strings.unavailableCategory;
            return (
              <AppButton
                key={category.accountId}
                variant={selected ? 'secondary' : 'ghost'}
                accessibilityLabel={
                  selected
                    ? strings.deselectCategoryActivity(accessibleName)
                    : strings.showCategoryActivity(accessibleName)
                }
                accessibilityState={{ selected }}
                onPress={() => onFilterCategory(selected ? null : category.accountId)}
                buttonStyle={styles.categoryButton}
              >
                <Column flex={1} gap="xs">
                  <Row align="center" justify="space-between" gap="sm" flexWrap="wrap">
                    <View style={styles.categoryLabel}>
                      <AccountInlineLabel
                        account={account}
                        placeholder={strings.unavailableCategory}
                        variant="body"
                        pillSize="sm"
                      />
                      <AppText variant="caption" color="secondary">
                        {strings.entries(category.entryCount)}
                      </AppText>
                    </View>
                    <MoneyText
                      amount={category.spent}
                      currencyCode={currencyCode}
                      variant="body"
                      weight="semibold"
                    />
                  </Row>
                  <View
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    style={[styles.shareTrack, { backgroundColor: theme.surfaceSecondary }]}
                  >
                    <View
                      testID={`budget-category-share-${category.accountId}`}
                      style={[styles.shareFill, { width, backgroundColor: theme.error }]}
                    />
                  </View>
                  {category.hasUnvaluedEntries ? (
                    <AppText variant="caption" color="warning">
                      {strings.incompleteCurrencyValuation}
                    </AppText>
                  ) : null}
                </Column>
              </AppButton>
            );
          })}
        </Column>
      )}

      {chartData && chartData.refunds !== 0 ? (
        <Row justify="space-between" align="baseline" gap="sm" flexWrap="wrap">
          <AppText variant="caption" color="secondary">
            {strings.refundsAndReversals}
          </AppText>
          <MoneyText amount={chartData.refunds} currencyCode={currencyCode} variant="caption" />
        </Row>
      ) : null}
      {chartData?.hasUnvaluedEntries ? (
        <AppText variant="caption" color="warning">
          {strings.partialCategoryAmounts}
        </AppText>
      ) : null}
    </Column>
  );
}

const styles = StyleSheet.create({
  errorState: { gap: Spacing.sm, alignItems: 'flex-start' },
  categoryButton: {
    alignItems: 'stretch',
    minHeight: 56,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderRadius: Shape.radius.md,
  },
  categoryLabel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.sm,
    flexShrink: 1,
  },
  shareTrack: { height: 4, width: '100%', overflow: 'hidden', borderRadius: Shape.radius.full },
  shareFill: { height: '100%', borderRadius: Shape.radius.full },
});
