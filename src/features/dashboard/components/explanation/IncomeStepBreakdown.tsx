import { AppIcon, AppText } from '@/src/components/core';
import { Opacity, Size, Spacing } from '@/src/constants';
import { useDashboardFeatureActions } from '@/src/features/dashboard/hooks/useDashboardFeatureActions';
import { SafeToSpendViewModel } from '@/src/features/dashboard/types/SafeToSpendViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface IncomeStepBreakdownProps {
  income: SafeToSpendViewModel['income'];
  labels: SafeToSpendViewModel['labels'];
  currencyCode: string;
  formatSts: (amount: number, currency: string, options?: { prefix?: string }) => string;
}

export const IncomeStepBreakdown = ({
  income,
  labels,
  currencyCode,
  formatSts,
}: IncomeStepBreakdownProps) => {
  const { theme } = useTheme();
  const { openPlannedPayment } = useDashboardFeatureActions();

  const activeIncome = income?.filter(inc => inc.amount !== 0) ?? [];

  return (
    <View style={styles.container}>
      {activeIncome.length > 0 ? (
        activeIncome.map((inc, i) => (
          <TouchableOpacity
            key={i}
            style={styles.row}
            onPress={() => {
              if (inc.type === 'PLANNED_PAYMENT') {
                openPlannedPayment(inc.id, 'income_breakdown');
              }
            }}
            disabled={inc.type !== 'PLANNED_PAYMENT'}
            activeOpacity={Opacity.heavy}
          >
            <View style={styles.content}>
              <AppText variant="caption" weight="bold">
                {inc.name}
              </AppText>
              <View style={styles.badgeRow}>
                <AppIcon
                  name={inc.type === 'PLANNED_PAYMENT' ? 'calendar' : 'refresh'}
                  size={Size.xxs}
                  color={theme.success}
                />
                <AppText variant="caption" color="secondary">
                  Day {inc.dayOffset} •{' '}
                  {inc.type === 'PLANNED_PAYMENT' ? 'Planned Payment' : 'Transfer'}
                </AppText>
              </View>
            </View>
            <AppText variant="caption" weight="bold" color="success" tabular>
              {formatSts(inc.amount, currencyCode, { prefix: '+' })}
            </AppText>
          </TouchableOpacity>
        ))
      ) : (
        <AppText variant="caption" color="secondary" italic>
          {labels.noFutureIncome}
        </AppText>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
});
