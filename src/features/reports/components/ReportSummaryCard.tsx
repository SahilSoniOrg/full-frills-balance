import { AppCard, AppText, ListGroup, ListRow } from '@/src/components/core';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { AppConfig, Spacing } from '@/src/constants';
import type { ReportSummaryVm } from '@/src/features/reports/hooks/reportTabTypes';
import { useTheme } from '@/src/hooks/use-theme';
import { formatCategoryLabel } from '@/src/services/reports/reportCategoryLabel';
import { formatDate } from '@/src/utils/dateUtils';
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
        <ListGroup variant="plain">
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
        </ListGroup>
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
        <ListGroup variant="plain" header={AppConfig.strings.reports.summaryHighlights}>
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
            onPress={
              largestSpendingCategory ? summary.onViewLargestCategoryTransactions : undefined
            }
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
        </ListGroup>
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
    <ListRow
      testID={testID}
      title={label}
      trailing={
        <MoneyText
          amount={prefix ? Math.abs(amount) : amount}
          currencyCode={currencyCode}
          variant="subheading"
          color={color}
          prefix={prefix}
        />
      }
      chevron={!!onPress}
      onPress={onPress}
    />
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
    <ListRow
      testID={testID}
      title={value}
      subtitle={label}
      trailing={
        amount !== undefined ? (
          <MoneyText
            amount={amount}
            currencyCode={currencyCode}
            variant="caption"
            color="secondary"
          />
        ) : undefined
      }
      chevron={!!onPress}
      onPress={onPress}
    />
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
  // ponytail: cancel the plain rows' own padding so they line up with the card content.
  metricGrid: {
    marginHorizontal: -Spacing.md,
    marginTop: Spacing.md,
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
    marginHorizontal: -Spacing.md,
    marginTop: Spacing.lg,
  },
});
