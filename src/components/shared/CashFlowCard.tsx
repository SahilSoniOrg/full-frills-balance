import { MoneyText } from '@/src/components/shared/MoneyText';
import { AppCard, AppText, AppSegmentedControl } from '@/src/components/core';
import { Spacing, Typography } from '@/src/constants';
import { Separator } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { StyleSheet, View } from 'react-native';
import { IncompleteFxWarning } from './IncompleteFxWarning';
import { MetricBreakdownRow } from './MetricBreakdownRow';

interface CashFlowCardProps {
  totalIncome: number;
  totalExpense: number;
  inflowPeriod: 'overall' | 'month' | '30days';
  onChangePeriod: (period: 'overall' | 'month' | '30days') => void;
  currencyCode: string;
  isLoading?: boolean;
  warning?: string;
  onWarningPress?: () => void;
}

export const CashFlowCard = ({
  totalIncome,
  totalExpense,
  inflowPeriod,
  onChangePeriod,
  currencyCode,
  isLoading = false,
  warning,
  onWarningPress,
}: CashFlowCardProps) => {
  const { theme, fonts } = useTheme();

  const netCashFlow = totalIncome - totalExpense;

  return (
    <AppCard
      elevation="md"
      paddingSize="lg"
      radius="r1"
      style={[styles.container, { backgroundColor: theme.surface }]}
    >
      <View style={styles.header}>
        <AppText variant="subheading" color="secondary">
          Net Inflow
        </AppText>
      </View>

      <MoneyText
        amount={netCashFlow}
        currencyCode={currencyCode}
        formatStyle="compact"
        loading={isLoading}
        variant="title"
        style={[
          styles.netAmount,
          { fontFamily: fonts.bold, color: netCashFlow >= 0 ? theme.income : theme.expense },
        ]}
      />

      <View style={styles.periodToggleContainer}>
        <AppSegmentedControl<'overall' | 'month' | '30days'>
          size="sm"
          flex
          options={[
            { id: 'overall', label: 'All Time' },
            { id: 'month', label: 'This Month' },
            { id: '30days', label: '30 Days' },
          ]}
          value={inflowPeriod}
          onChange={onChangePeriod}
        />
      </View>

      <View style={styles.breakdownContainer}>
        <MetricBreakdownRow
          dotColor={theme.income}
          label="Total Income"
          amount={totalIncome}
          currencyCode={currencyCode}
          isLoading={isLoading}
          moneyColor="income"
        />

        <Separator vertical background="divider" style={styles.divider} />

        <MetricBreakdownRow
          dotColor={theme.expense}
          label="Total Expenses"
          amount={totalExpense}
          currencyCode={currencyCode}
          isLoading={isLoading}
          moneyColor="expense"
        />
      </View>
      {warning && onWarningPress ? (
        <View style={styles.warning}>
          <IncompleteFxWarning message={warning} onPress={onWarningPress} />
        </View>
      ) : warning ? (
        <AppText variant="caption" color="warning" style={styles.warning}>
          {warning}
        </AppText>
      ) : null}
    </AppCard>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  netAmount: {
    fontSize: Typography.sizes.xxxl,
    marginBottom: Spacing.sm,
  },
  periodToggleContainer: {
    marginBottom: Spacing.lg,
  },
  breakdownContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  divider: {
    marginHorizontal: Spacing.md,
  },
  warning: {
    marginTop: Spacing.md,
  },
});
