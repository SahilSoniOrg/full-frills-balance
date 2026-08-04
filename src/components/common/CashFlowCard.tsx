import { MoneyText } from '@/src/components/common/MoneyText';
import { AppCard, AppText, AppSegmentedControl } from '@/src/components/core';
import { Shape, Spacing, Typography } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { StyleSheet, View } from 'react-native';

interface CashFlowCardProps {
  totalIncome: number;
  totalExpense: number;
  inflowPeriod: 'overall' | 'month' | '30days';
  onChangePeriod: (period: 'overall' | 'month' | '30days') => void;
  currencyCode: string;
  isLoading?: boolean;
}

export const CashFlowCard = ({
  totalIncome,
  totalExpense,
  inflowPeriod,
  onChangePeriod,
  currencyCode,
  isLoading = false,
}: CashFlowCardProps) => {
  const { theme, fonts } = useTheme();

  const netCashFlow = totalIncome - totalExpense;

  return (
    <AppCard
      elevation="md"
      padding="lg"
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
        <View style={styles.breakdownItem}>
          <View style={[styles.dot, { backgroundColor: theme.income }]} />
          <View>
            <AppText variant="caption" color="secondary">
              Total Income
            </AppText>
            <MoneyText
              amount={totalIncome}
              currencyCode={currencyCode}
              formatStyle="compact"
              loading={isLoading}
              variant="heading"
              color="income"
            />
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: theme.divider }]} />

        <View style={styles.breakdownItem}>
          <View style={[styles.dot, { backgroundColor: theme.expense }]} />
          <View>
            <AppText variant="caption" color="secondary">
              Total Expenses
            </AppText>
            <MoneyText
              amount={totalExpense}
              currencyCode={currencyCode}
              formatStyle="compact"
              loading={isLoading}
              variant="heading"
              color="expense"
            />
          </View>
        </View>
      </View>
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
  breakdownItem: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  dot: {
    width: Spacing.sm,
    height: Spacing.sm,
    borderRadius: Shape.radius.full,
    marginTop: Spacing.xs + 2,
  },
  divider: {
    width: 1,
    height: '100%',
    marginHorizontal: Spacing.md,
  },
});
