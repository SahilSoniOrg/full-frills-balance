import { AppCard, AppText } from '@/src/components/core';
import { AppConfig, Shape, Spacing, Typography } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { StyleSheet, View } from 'react-native';

interface NetWorthCardProps {
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  currencyCode: string;
  isLoading?: boolean;
  /** Screen/VM privacy flag — do not read privacy hooks in this leaf. */
  isPrivacyMode: boolean;
}

export const NetWorthCard = ({
  netWorth,
  totalAssets,
  totalLiabilities,
  currencyCode,
  isLoading = false,
  isPrivacyMode,
}: NetWorthCardProps) => {
  const { theme, fonts } = useTheme();

  const formatCurrency = (amount: number) => {
    if (isLoading) return '...';
    if (isPrivacyMode) return AppConfig.privacyMask;
    return CurrencyFormatter.format(amount, currencyCode, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  };

  return (
    <AppCard
      elevation="md"
      padding="lg"
      radius="r1"
      style={[styles.container, { backgroundColor: theme.surface }]}
    >
      <View style={styles.header}>
        <AppText variant="subheading" color="secondary">
          Net Worth
        </AppText>
      </View>

      <AppText variant="title" style={[styles.netWorthAmount, { fontFamily: fonts.bold }]}>
        {formatCurrency(netWorth)}
      </AppText>

      <View style={styles.breakdownContainer}>
        <View style={styles.breakdownItem}>
          <View style={[styles.dot, { backgroundColor: theme.asset }]} />
          <View>
            <AppText variant="caption" color="secondary">
              Assets
            </AppText>
            <AppText variant="heading" color="asset">
              {formatCurrency(totalAssets)}
            </AppText>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: theme.divider }]} />

        <View style={styles.breakdownItem}>
          <View style={[styles.dot, { backgroundColor: theme.liability }]} />
          <View>
            <AppText variant="caption" color="secondary">
              Liabilities
            </AppText>
            <AppText variant="heading" color="liability">
              {formatCurrency(totalLiabilities)}
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
