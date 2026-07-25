import { AppText } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Spacing, withOpacity } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface JournalSummaryProps {
  totalDebits: number;
  totalCredits: number;
  isBalanced: boolean;
  isBalancedDisplay?: boolean;
  availableCurrencies?: string[];
  selectedCurrency?: string;
  onSelectCurrency?: (currency: string) => void;
  workplaceCurrency: string;
}

export function JournalSummary({
  totalDebits,
  totalCredits,
  isBalanced,
  isBalancedDisplay = true,
  availableCurrencies = [],
  selectedCurrency,
  onSelectCurrency,
  workplaceCurrency,
}: JournalSummaryProps) {
  const { theme } = useTheme();
  const currency = selectedCurrency || workplaceCurrency;
  const difference = Math.abs(totalDebits - totalCredits);
  const showSelector = availableCurrencies.length > 1;
  const isEmptyLedger = totalDebits === 0 && totalCredits === 0;

  // Determining the status message
  let statusColor: 'success' | 'error' = isBalanced ? 'success' : 'error';
  let statusText = '';

  if (isBalanced) {
    statusText = AppConfig.strings.journalSummary.balanced(currency);
  } else if (!isBalancedDisplay) {
    // Doesn't balance in the currently selected currency either
    statusText = AppConfig.strings.journalSummary.unbalanced(currency);
  } else {
    // Balances in display currency but NOT in workplace base
    statusText = AppConfig.strings.journalSummary.unbalanced(workplaceCurrency) + ' (BASE)';
  }

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
          <AppText variant="body" color="secondary" weight="bold">
            {AppConfig.strings.journalSummary.totalAmount}
          </AppText>
          <AppText variant="body" weight="bold" color="primary">
            {CurrencyFormatter.format(totalDebits, currency)}
          </AppText>
        </View>

        <View
          style={[styles.divider, { backgroundColor: theme.divider, marginVertical: Spacing.xs }]}
        />

        <View style={styles.summaryRow}>
          <AppText variant="caption" color="tertiary" weight="bold">
            {AppConfig.strings.journalSummary.totalDebits.toUpperCase()}
          </AppText>
          <AppText variant="caption" weight="semibold" color="tertiary">
            {CurrencyFormatter.format(totalDebits, currency)}
          </AppText>
        </View>

        <View style={styles.summaryRow}>
          <AppText variant="caption" color="tertiary" weight="bold">
            {AppConfig.strings.journalSummary.totalCredits.toUpperCase()}
          </AppText>
          <AppText variant="caption" weight="semibold" color="tertiary">
            {CurrencyFormatter.format(totalCredits, currency)}
          </AppText>
        </View>

        <View style={[styles.balanceSection, { borderTopColor: theme.divider }]}>
          <View style={styles.summaryRow}>
            <AppText variant="body" weight="bold" color="secondary">
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
              <AppText variant="body" weight="bold" color={isBalanced ? 'success' : 'error'}>
                {CurrencyFormatter.format(difference, currency)}
              </AppText>
            </View>
          </View>

          <View style={styles.statusIndicator}>
            {!(isEmptyLedger && isBalanced) && (
              <>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: statusColor === 'success' ? theme.success : theme.error },
                  ]}
                />
                <AppText
                  variant="caption"
                  color={statusColor}
                  weight="bold"
                  style={{ letterSpacing: 0.5 }}
                >
                  {statusText.toUpperCase()}
                </AppText>
              </>
            )}
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
  divider: {
    height: 1,
    width: '100%',
    opacity: Opacity.muted,
  },
});
