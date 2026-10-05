import { MoneyText } from '@/src/components/shared/MoneyText';
import { AppText } from '@/src/components/core';
import { Shape, Spacing } from '@/src/constants';
import type { ComponentVariant } from '@/src/utils/style-helpers';
import { StyleSheet, View } from 'react-native';

type MetricBreakdownRowProps = {
  dotColor: string;
  label: string;
  amount: number;
  currencyCode: string;
  isLoading?: boolean;
  moneyColor: ComponentVariant;
};

export function MetricBreakdownRow({
  dotColor,
  label,
  amount,
  currencyCode,
  isLoading,
  moneyColor,
}: MetricBreakdownRowProps) {
  return (
    <View style={styles.breakdownItem}>
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <View>
        <AppText variant="caption" color="secondary">
          {label}
        </AppText>
        <MoneyText
          amount={amount}
          currencyCode={currencyCode}
          formatStyle="compact"
          loading={isLoading}
          variant="heading"
          color={moneyColor}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
});
