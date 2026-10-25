import { AppSegmentedControl, AppText } from '@/src/components/core';
import { Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { StyleSheet, View } from 'react-native';
import { IncompleteFxWarning } from './IncompleteFxWarning';
import { MetricHeroCard } from './MetricHeroCard';

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
  const { theme } = useTheme();
  const netCashFlow = totalIncome - totalExpense;

  return (
    <MetricHeroCard
      title="Net Inflow"
      amount={netCashFlow}
      currencyCode={currencyCode}
      isLoading={isLoading}
      amountColor={netCashFlow >= 0 ? theme.income : theme.expense}
      amountStyle={styles.netAmount}
      middle={
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
      }
      left={{
        dotColor: theme.income,
        label: 'Total Income',
        amount: totalIncome,
        moneyColor: 'income',
      }}
      right={{
        dotColor: theme.expense,
        label: 'Total Expenses',
        amount: totalExpense,
        moneyColor: 'expense',
      }}
      footer={
        warning && onWarningPress ? (
          <View style={styles.warning}>
            <IncompleteFxWarning message={warning} onPress={onWarningPress} />
          </View>
        ) : warning ? (
          <AppText variant="caption" color="warning" style={styles.warning}>
            {warning}
          </AppText>
        ) : null
      }
    />
  );
};

const styles = StyleSheet.create({
  netAmount: {
    marginBottom: Spacing.sm,
  },
  periodToggleContainer: {
    marginBottom: Spacing.lg,
  },
  warning: {
    marginTop: Spacing.md,
  },
});
