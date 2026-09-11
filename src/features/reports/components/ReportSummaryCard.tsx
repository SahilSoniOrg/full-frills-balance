import { MoneyText } from '@/src/components/shared/MoneyText';
import { AppButton, AppCard, AppText } from '@/src/components/core';
import { AppConfig, Spacing } from '@/src/constants';
import type { ReportSummaryVm } from '@/src/features/reports/hooks/reportTabTypes';
import { formatCategoryLabel } from '@/src/services/reports/reportCategoryLabel';
import { formatDate } from '@/src/utils/dateUtils';
import { useTheme } from '@/src/hooks/use-theme';
import { StyleSheet, View } from 'react-native';

interface ReportSummaryCardProps {
  summary: ReportSummaryVm;
  currencyCode: string;
}

export function ReportSummaryCard({ summary, currencyCode }: ReportSummaryCardProps) {
  const { theme } = useTheme();
  const { comparison, largestSpendingCategory, highestSpendingDay } = summary;
  const canViewNetFlowTransactions = summary.income !== 0 || summary.expense !== 0;

  return (
    <AppCard testID="report-summary" paddingSize="lg" style={styles.card}>
      <AppText variant="heading" weight="semibold">
        {AppConfig.strings.reports.summaryTitle}
      </AppText>

      <View style={styles.metricGrid}>
        <SummaryMetric
          testID="report-summary-income"
          label={AppConfig.strings.reports.totalIncome}
          amount={summary.income}
          currencyCode={currencyCode}
          color="success"
          onPress={summary.income !== 0 ? summary.onViewIncomeTransactions : undefined}
        />
        <SummaryMetric
          testID="report-summary-expense"
          label={AppConfig.strings.reports.totalExpense}
          amount={summary.expense}
          currencyCode={currencyCode}
          color="error"
          onPress={summary.expense !== 0 ? summary.onViewExpenseTransactions : undefined}
        />
        <SummaryMetric
          testID="report-summary-net-flow"
          label={AppConfig.strings.reports.netFlow}
          amount={summary.netFlow}
          currencyCode={currencyCode}
          color={summary.netFlow >= 0 ? 'success' : 'error'}
          prefix={getSignPrefix(summary.netFlow)}
          onPress={canViewNetFlowTransactions ? summary.onViewNetFlowTransactions : undefined}
        />
      </View>

      <View style={[styles.comparison, { borderTopColor: theme.border }]}>
        <AppText variant="caption" color="secondary">
          {AppConfig.strings.reports.comparedWithPrevious}
        </AppText>
        {comparison ? (
          <View style={styles.comparisonGrid}>
            <ComparisonMetric
              label={AppConfig.strings.reports.totalIncome}
              amount={comparison.incomeChange}
              currencyCode={currencyCode}
              kind="income"
            />
            <ComparisonMetric
              label={AppConfig.strings.reports.totalExpense}
              amount={comparison.expenseChange}
              currencyCode={currencyCode}
              kind="expense"
            />
            <ComparisonMetric
              label={AppConfig.strings.reports.netFlowChange}
              amount={comparison.netFlowChange}
              currencyCode={currencyCode}
              kind="netFlow"
            />
          </View>
        ) : (
          <AppText variant="caption" color="secondary" style={styles.mutedValue}>
            {AppConfig.strings.reports.noPreviousPeriod}
          </AppText>
        )}
      </View>

      <View style={styles.highlights}>
        <AppText variant="caption" color="secondary">
          {AppConfig.strings.reports.summaryHighlights}
        </AppText>
        <HighlightRow
          testID="report-summary-largest-category"
          label={AppConfig.strings.reports.largestSpendingCategory}
          value={
            largestSpendingCategory
              ? formatCategoryLabel(largestSpendingCategory.category)
              : AppConfig.strings.reports.noData
          }
          amount={largestSpendingCategory?.amount}
          currencyCode={currencyCode}
          onPress={largestSpendingCategory ? summary.onViewLargestCategoryTransactions : undefined}
        />
        <HighlightRow
          testID="report-summary-highest-day"
          label={AppConfig.strings.reports.highestSpendingDay}
          value={
            highestSpendingDay
              ? formatDate(highestSpendingDay.date)
              : AppConfig.strings.reports.noData
          }
          amount={highestSpendingDay?.amount}
          currencyCode={currencyCode}
          onPress={highestSpendingDay ? summary.onViewHighestSpendingDayTransactions : undefined}
        />
      </View>
    </AppCard>
  );
}

function SummaryMetric({
  testID,
  label,
  amount,
  currencyCode,
  color,
  prefix,
  onPress,
}: {
  testID: string;
  label: string;
  amount: number;
  currencyCode: string;
  color: 'success' | 'error';
  prefix?: string;
  onPress?: () => void;
}) {
  return (
    <View testID={testID} style={styles.metric}>
      <AppText variant="caption" color="secondary">
        {label}
      </AppText>
      <MoneyText
        amount={prefix ? Math.abs(amount) : amount}
        currencyCode={currencyCode}
        variant="subheading"
        color={color}
        prefix={prefix}
      />
      {onPress ? (
        <ViewTransactionsButton testID={`${testID}-view-transactions`} onPress={onPress} />
      ) : null}
    </View>
  );
}

function ComparisonMetric({
  label,
  amount,
  currencyCode,
  kind,
}: {
  label: string;
  amount: number;
  currencyCode: string;
  kind: 'income' | 'expense' | 'netFlow';
}) {
  return (
    <View style={styles.comparisonMetric}>
      <AppText variant="caption" color="secondary">
        {label}
      </AppText>
      <MoneyText
        amount={Math.abs(amount)}
        currencyCode={currencyCode}
        variant="caption"
        weight="semibold"
        color={getComparisonColor(amount, kind)}
        prefix={getSignPrefix(amount)}
      />
    </View>
  );
}

function HighlightRow({
  testID,
  label,
  value,
  amount,
  currencyCode,
  onPress,
}: {
  testID: string;
  label: string;
  value: string;
  amount?: number;
  currencyCode: string;
  onPress?: () => void;
}) {
  return (
    <View testID={testID} style={styles.highlightRow}>
      <View style={styles.highlightCopy}>
        <AppText variant="caption" color="secondary">
          {label}
        </AppText>
        <View style={styles.highlightValue}>
          <AppText variant="body" weight="semibold" numberOfLines={1}>
            {value}
          </AppText>
          {amount !== undefined ? (
            <MoneyText
              amount={amount}
              currencyCode={currencyCode}
              variant="caption"
              color="secondary"
            />
          ) : null}
        </View>
      </View>
      {onPress ? (
        <ViewTransactionsButton testID={`${testID}-view-transactions`} onPress={onPress} />
      ) : null}
    </View>
  );
}

function ViewTransactionsButton({ testID, onPress }: { testID: string; onPress: () => void }) {
  return (
    <AppButton
      testID={testID}
      variant="ghost"
      size="sm"
      onPress={onPress}
      style={styles.viewButton}
      accessibilityLabel={AppConfig.strings.reports.viewTransactions}
    >
      {AppConfig.strings.reports.viewTransactions}
    </AppButton>
  );
}

function getSignPrefix(amount: number): string | undefined {
  if (amount > 0) return '+';
  if (amount < 0) return '−';
  return undefined;
}

function getComparisonColor(
  amount: number,
  kind: 'income' | 'expense' | 'netFlow',
): 'success' | 'error' | 'secondary' {
  if (amount === 0) return 'secondary';
  const isFavorable = kind === 'expense' ? amount < 0 : amount > 0;
  return isFavorable ? 'success' : 'error';
}

const styles = StyleSheet.create({
  card: {
    marginBottom: Spacing.xl,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  metric: {
    flexGrow: 1,
    flexBasis: 240,
    minWidth: 0,
  },
  comparison: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: Spacing.lg,
    paddingTop: Spacing.md,
  },
  comparisonGrid: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  comparisonMetric: {
    flex: 1,
    minWidth: 0,
  },
  mutedValue: {
    marginTop: Spacing.sm,
  },
  highlights: {
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  highlightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  highlightCopy: {
    flex: 1,
    minWidth: 0,
  },
  highlightValue: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  viewButton: {
    alignSelf: 'flex-start',
  },
});
