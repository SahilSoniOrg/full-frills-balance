import { AppCard, AppIcon, AppText } from '@/src/components/core';
import { Shape, Size, Spacing, Typography } from '@/src/constants';
import { usePrivacyPrefs } from '@/src/hooks/usePrivacyPrefs';
import { useTheme } from '@/src/hooks/use-theme';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface NetWorthCardProps {
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  currencyCode: string;
  isLoading?: boolean;
  hidden?: boolean;
  onToggleHidden?: (hidden: boolean) => void;
}

export const NetWorthCard = ({
  netWorth,
  totalAssets,
  totalLiabilities,
  currencyCode,
  isLoading = false,
  hidden: controlledHidden,
  onToggleHidden,
}: NetWorthCardProps) => {
  const { theme, fonts } = useTheme();
  const { isPrivacyMode } = usePrivacyPrefs();

  const [overrideHidden, setOverrideHidden] = useState<boolean | null>(null);

  const isActuallyHidden =
    controlledHidden !== undefined
      ? controlledHidden
      : overrideHidden !== null
        ? overrideHidden
        : isPrivacyMode;

  const handleToggle = () => {
    if (onToggleHidden) {
      onToggleHidden(!isActuallyHidden);
    } else {
      setOverrideHidden(!isActuallyHidden);
    }
  };

  const formatCurrency = (amount: number) => {
    if (isLoading) return '...';
    if (isActuallyHidden) return '••••';
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
      style={[styles.container, { backgroundColor: theme.surface }]} // Maybe use primary color bg?
    >
      <View style={styles.header}>
        <AppText variant="subheading" color="secondary">
          Net Worth
        </AppText>
        <TouchableOpacity
          onPress={handleToggle}
          hitSlop={{ top: Spacing.sm, bottom: Spacing.sm, left: Spacing.sm, right: Spacing.sm }}
        >
          <AppIcon
            name={isActuallyHidden ? 'eyeOff' : 'eye'}
            size={Size.sm}
            color={theme.textTertiary}
          />
        </TouchableOpacity>
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
    alignItems: 'flex-start', // specific alignment
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
    marginTop: Spacing.xs + 2, // Optical alignment with text
  },
  divider: {
    width: 1,
    height: '100%',
    marginHorizontal: Spacing.md,
  },
});
