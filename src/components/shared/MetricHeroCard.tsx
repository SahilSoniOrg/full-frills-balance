import { MoneyText } from '@/src/components/shared/MoneyText';
import { AppCard, AppText } from '@/src/components/core';
import { Spacing } from '@/src/constants';
import { Separator } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import type { ComponentVariant } from '@/src/utils/style-helpers';
import { type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';
import { MetricBreakdownRow } from './MetricBreakdownRow';

export type MetricHeroBreakdown = {
  dotColor: string;
  label: string;
  amount: number;
  moneyColor: ComponentVariant;
};

type MetricHeroCardProps = {
  title: string;
  amount: number;
  currencyCode: string;
  isLoading?: boolean;
  amountColor?: string;
  amountStyle?: StyleProp<TextStyle>;
  /** Content between the hero amount and the breakdown (e.g. period control). */
  middle?: ReactNode;
  left: MetricHeroBreakdown;
  right: MetricHeroBreakdown;
  footer?: ReactNode;
};

/** Shared shell for dashboard metric summaries (net worth, cash flow). */
export function MetricHeroCard({
  title,
  amount,
  currencyCode,
  isLoading = false,
  amountColor,
  amountStyle,
  middle,
  left,
  right,
  footer,
}: MetricHeroCardProps) {
  const { theme } = useTheme();

  return (
    <AppCard
      elevation="md"
      paddingSize="lg"
      radius="r1"
      style={[styles.container, { backgroundColor: theme.surface }]}
    >
      <View style={styles.header}>
        <AppText variant="subheading" color="secondary">
          {title}
        </AppText>
      </View>

      <MoneyText
        amount={amount}
        currencyCode={currencyCode}
        formatStyle="compact"
        loading={isLoading}
        variant="title"
        style={[styles.amount, amountStyle, amountColor ? { color: amountColor } : null]}
      />

      {middle}

      <View style={styles.breakdownContainer}>
        <MetricBreakdownRow
          dotColor={left.dotColor}
          label={left.label}
          amount={left.amount}
          currencyCode={currencyCode}
          isLoading={isLoading}
          moneyColor={left.moneyColor}
        />

        <Separator vertical background="divider" style={styles.divider} />

        <MetricBreakdownRow
          dotColor={right.dotColor}
          label={right.label}
          amount={right.amount}
          currencyCode={currencyCode}
          isLoading={isLoading}
          moneyColor={right.moneyColor}
        />
      </View>

      {footer}
    </AppCard>
  );
}

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
  amount: {
    marginBottom: Spacing.xl,
  },
  breakdownContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  divider: {
    marginHorizontal: Spacing.md,
  },
});
