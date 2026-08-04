import { MoneyText } from '@/src/components/common/MoneyText';
import { AppText } from '@/src/components/core';
import { AppConfig, Shape, Spacing } from '@/src/constants';
import { ReportChartCard } from '@/src/features/reports/components/ReportChartCard';
import { useTheme } from '@/src/hooks/use-theme';
import { StyleSheet, View } from 'react-native';

const BAR_SPACER_WIDTH = Spacing.xs;
const BALANCE_BAR_HEIGHT = Spacing.sm;

export interface IncomeExpenseBalanceWidgetProps {
  incomeBarFlex: number;
  expenseBarFlex: number;
  income: number;
  expense: number;
  currencyCode: string;
}

export function IncomeExpenseBalanceWidget({
  incomeBarFlex,
  expenseBarFlex,
  income,
  expense,
  currencyCode,
}: IncomeExpenseBalanceWidgetProps) {
  const { theme } = useTheme();

  return (
    <ReportChartCard zIndex={30}>
      <View style={styles.balanceRow}>
        <View style={styles.balanceItem}>
          <AppText variant="caption" color="secondary">
            {AppConfig.strings.reports.totalIncome}
          </AppText>
          <MoneyText
            amount={income}
            currencyCode={currencyCode}
            variant="subheading"
            style={{ color: theme.success }}
          />
        </View>
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <View style={styles.balanceItem}>
          <AppText variant="caption" color="secondary">
            {AppConfig.strings.reports.totalExpense}
          </AppText>
          <MoneyText
            amount={expense}
            currencyCode={currencyCode}
            variant="subheading"
            style={{ color: theme.error }}
          />
        </View>
      </View>
      <View style={styles.barContainer}>
        <View style={[styles.bar, { flex: incomeBarFlex, backgroundColor: theme.success }]} />
        <View style={{ width: BAR_SPACER_WIDTH }} />
        <View style={[styles.bar, { flex: expenseBarFlex, backgroundColor: theme.error }]} />
      </View>
    </ReportChartCard>
  );
}

const styles = StyleSheet.create({
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  balanceItem: {
    flex: 1,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    marginHorizontal: Spacing.md,
  },
  barContainer: {
    flexDirection: 'row',
    height: BALANCE_BAR_HEIGHT,
    borderRadius: Shape.radius.xs,
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    borderRadius: Shape.radius.xs,
  },
});
