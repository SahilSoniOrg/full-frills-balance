import { MoneyText } from '@/src/components/common/MoneyText';
import { AppCard, AppText } from '@/src/components/core';
import { Shape, Spacing, Typography } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
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
  const { theme, fonts } = useTheme();

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
        style={[styles.netWorthAmount, { fontFamily: fonts.bold }]}
      />

      <View style={styles.breakdownContainer}>
        <View style={styles.breakdownItem}>
          <View style={[styles.dot, { backgroundColor: theme.asset }]} />
          <View>
            <AppText variant="caption" color="secondary">
              Assets
            </AppText>
            <MoneyText
              amount={totalAssets}
              currencyCode={currencyCode}
              formatStyle="compact"
              loading={isLoading}
              variant="heading"
              color="asset"
            />
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: theme.divider }]} />

        <View style={styles.breakdownItem}>
          <View style={[styles.dot, { backgroundColor: theme.liability }]} />
          <View>
            <AppText variant="caption" color="secondary">
              Liabilities
            </AppText>
            <MoneyText
              amount={totalLiabilities}
              currencyCode={currencyCode}
              formatStyle="compact"
              loading={isLoading}
              variant="heading"
              color="liability"
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
  netWorthAmount: {
    fontSize: Typography.sizes.xxxl,
    marginBottom: Spacing.xl,
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
