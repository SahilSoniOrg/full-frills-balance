import { AppText } from '@/src/components/core';
import { Opacity, Shape, Spacing, withOpacity } from '@/src/constants';
import { SafeToSpendViewModel } from '@/src/features/dashboard/types/SafeToSpendViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet, View } from 'react-native';

interface DebtsStepBreakdownProps {
  debt: SafeToSpendViewModel['debt'];
  labels: SafeToSpendViewModel['labels'];
  totalLiabilities: number;
  committedLiabilities: number;
  currencyCode: string;
  formatSts: (amount: number, currency: string, options?: { prefix?: string }) => string;
}

export const DebtsStepBreakdown = ({
  debt,
  labels,
  totalLiabilities,
  committedLiabilities,
  currencyCode,
  formatSts,
}: DebtsStepBreakdownProps) => {
  const { theme } = useTheme();

  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        container: {
          gap: Spacing.md,
        },
        hintText: {
          marginBottom: Spacing.md,
          opacity: Opacity.heavy,
          fontStyle: 'italic',
        },
        debtRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        },
        liabilityCallout: {
          marginTop: Spacing.md,
          padding: Spacing.md,
          backgroundColor: withOpacity(theme.surfaceSecondary, Opacity.medium),
          borderRadius: Shape.radius.sm,
        },
      }),
    [theme],
  );

  const activeDebts = debt?.filter(acc => acc.amount !== 0) ?? [];

  return (
    <View>
      <AppText variant="caption" color="secondary" style={styles.hintText}>
        {labels.debtsHint}
      </AppText>

      <View style={styles.container}>
        {activeDebts.map((acc, i) => (
          <View key={i} style={styles.debtRow}>
            <View style={{ flex: 1 }}>
              <AppText variant="caption" weight="bold">
                {acc.accountName}
              </AppText>
              <AppText variant="caption" color="secondary">
                {acc.type === 'FALLBACK' ? labels.unplannedBalance : labels.scheduledCommitment}
              </AppText>
            </View>
            <AppText variant="caption" weight="bold" color="error" tabular>
              {formatSts(acc.amount, currencyCode, { prefix: '–' })}
            </AppText>
          </View>
        ))}
      </View>

      {totalLiabilities > committedLiabilities && (
        <View style={styles.liabilityCallout}>
          <AppText variant="caption" color="secondary" style={{ lineHeight: 16 }}>
            <AppText variant="caption" weight="bold" tabular>
              {formatSts(totalLiabilities - committedLiabilities, currencyCode)}
            </AppText>{' '}
            {labels.debtsCallout}
          </AppText>
        </View>
      )}
    </View>
  );
};
