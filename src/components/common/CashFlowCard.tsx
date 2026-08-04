import { AppCard, AppText, AppSegmentedControl } from '@/src/components/core';
import { AppConfig, Shape, Spacing, Typography } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { StyleSheet, View } from 'react-native';

interface CashFlowCardProps {
  totalIncome: number;
  totalExpense: number;
  inflowPeriod: 'overall' | 'month' | '30days';
  onChangePeriod: (period: 'overall' | 'month' | '30days') => void;
  currencyCode: string;
  isLoading?: boolean;
  /** Screen/VM privacy flag — do not read privacy hooks in this leaf. */
  isPrivacyMode: boolean;
}

export const CashFlowCard = ({
  totalIncome,
  totalExpense,
  inflowPeriod,
  onChangePeriod,
  currencyCode,
  isLoading = false,
  isPrivacyMode,
}: CashFlowCardProps) => {
  const { theme, fonts } = useTheme();

  const formatCurrency = (amount: number) => {
    if (isLoading) return '...';
    if (isPrivacyMode) return AppConfig.privacyMask;
    return CurrencyFormatter.format(amount, currencyCode, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  };

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

      <AppText
        variant="title"
        style={[
          styles.netAmount,
          { fontFamily: fonts.bold, color: netCashFlow >= 0 ? theme.income : theme.expense },
        ]}
      >
        {formatCurrency(netCashFlow)}
      </AppText>

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
            <AppText variant="heading" color="income">
              {formatCurrency(totalIncome)}
            </AppText>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: theme.divider }]} />

        <View style={styles.breakdownItem}>
          <View style={[styles.dot, { backgroundColor: theme.expense }]} />
          <View>
            <AppText variant="caption" color="secondary">
              Total Expenses
            </AppText>
            <AppText variant="heading" color="expense">
              {formatCurrency(totalExpense)}
            </AppText>
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
