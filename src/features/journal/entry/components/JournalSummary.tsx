import { AppText } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Spacing, withOpacity } from '@/src/constants';
import { useWorkplaceCurrency } from '@/src/hooks/use-currencies';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface JournalSummaryProps {
  totalDebits: number;
  totalCredits: number;
  isBalanced: boolean;
  availableCurrencies?: string[];
  selectedCurrency?: string;
  onSelectCurrency?: (currency: string) => void;
}

export function JournalSummary({
  totalDebits,
  totalCredits,
  isBalanced,
  availableCurrencies = [],
  selectedCurrency,
  onSelectCurrency,
}: JournalSummaryProps) {
  const { theme } = useTheme();
  const workplaceCurrency = useWorkplaceCurrency();
  const currency = selectedCurrency || workplaceCurrency;
  const difference = Math.abs(totalDebits - totalCredits);
  const showSelector = availableCurrencies.length > 1;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <AppText variant="subheading" weight="bold" color="tertiary">
          {AppConfig.strings.journalSummary.title}
        </AppText>
        {showSelector && (
          <View style={styles.currencySelector}>
            {availableCurrencies.map(c => (
              <TouchableOpacity
                key={c}
                onPress={() => onSelectCurrency?.(c)}
                style={[
                  styles.currencyChip,
                  {
                    backgroundColor: c === currency ? theme.primary : theme.surfaceSecondary,
                    borderColor: c === currency ? theme.primary : theme.border,
                    borderWidth: 1,
                  },
                ]}
              >
                <AppText
                  variant="caption"
                  weight="bold"
                  style={{ color: c === currency ? theme.pureInverse : theme.textSecondary }}
                >
                  {c}
                </AppText>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <View
        style={[
          styles.mainSummary,
          { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
        ]}
      >
        <View style={styles.summaryRow}>
          <AppText variant="body" color="secondary">
            {AppConfig.strings.journalSummary.totalDebits}
          </AppText>
          <AppText variant="body" weight="semibold">
            {totalDebits.toFixed(2)} {currency}
          </AppText>
        </View>

        <View style={styles.summaryRow}>
          <AppText variant="body" color="secondary">
            {AppConfig.strings.journalSummary.totalCredits}
          </AppText>
          <AppText variant="body" weight="semibold">
            {totalCredits.toFixed(2)} {currency}
          </AppText>
        </View>

        <View style={[styles.balanceSection, { borderTopColor: theme.divider }]}>
          <View style={styles.summaryRow}>
            <AppText variant="heading" weight="bold">
              {AppConfig.strings.journalSummary.balance}
            </AppText>
            <View
              style={[
                styles.diffPill,
                {
                  backgroundColor: isBalanced
                    ? withOpacity(theme.success, Opacity.soft)
                    : withOpacity(theme.error, Opacity.soft),
                },
              ]}
            >
              <AppText variant="heading" weight="bold" color={isBalanced ? 'success' : 'error'}>
                {difference.toFixed(2)} {currency}
              </AppText>
            </View>
          </View>

          <View style={styles.statusIndicator}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: isBalanced ? theme.success : theme.error },
              ]}
            />
            <AppText
              variant="caption"
              color={isBalanced ? 'success' : 'error'}
              weight="bold"
              style={{ letterSpacing: 0.5 }}
            >
              {isBalanced
                ? AppConfig.strings.journalSummary.balanced(currency).toUpperCase()
                : AppConfig.strings.journalSummary.unbalanced(currency).toUpperCase()}
            </AppText>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: Spacing.xl,
  },
  mainSummary: {
    borderRadius: Shape.radius.r3,
    padding: Spacing.lg,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.xs,
  },
  currencySelector: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  currencyChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: Shape.radius.full,
  },
  balanceSection: {
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    marginTop: Spacing.xs,
    gap: Spacing.md,
  },
  diffPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: Shape.radius.r2,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
