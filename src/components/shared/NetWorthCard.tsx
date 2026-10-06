import { MoneyText } from '@/src/components/shared/MoneyText';
import { AppCard, AppText } from '@/src/components/core';
import { Spacing } from '@/src/constants';
import { Separator } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { MetricBreakdownRow } from './MetricBreakdownRow';
import { StyleSheet, View } from 'react-native';

interface NetWorthCardProps {
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  currencyCode: string;
  isLoading?: boolean;
}

export const NetWorthCard = ({
  netWorth,
  totalAssets,
  totalLiabilities,
  currencyCode,
  isLoading = false,
}: NetWorthCardProps) => {
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
          Net Worth
        </AppText>
      </View>

      <MoneyText
        amount={netWorth}
        currencyCode={currencyCode}
        formatStyle="compact"
        loading={isLoading}
        variant="title"
        style={styles.netWorthAmount}
      />

      <View style={styles.breakdownContainer}>
        <MetricBreakdownRow
          dotColor={theme.asset}
          label="Assets"
          amount={totalAssets}
          currencyCode={currencyCode}
          isLoading={isLoading}
          moneyColor="asset"
        />

        <Separator vertical background="divider" style={styles.divider} />

        <MetricBreakdownRow
          dotColor={theme.liability}
          label="Liabilities"
          amount={totalLiabilities}
          currencyCode={currencyCode}
          isLoading={isLoading}
          moneyColor="liability"
        />
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
  netWorthAmount: {
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
