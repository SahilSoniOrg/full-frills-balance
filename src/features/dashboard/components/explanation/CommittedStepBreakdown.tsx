import { AppIcon, AppText } from '@/src/components/core';
import { Opacity, Size, Spacing } from '@/src/constants';
import { useDashboardFeatureActions } from '@/src/features/dashboard/hooks/useDashboardFeatureActions';
import { SafeToSpendViewModel } from '@/src/features/dashboard/types/SafeToSpendViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface CommittedStepBreakdownProps {
  committed: SafeToSpendViewModel['committed'];
  labels: SafeToSpendViewModel['labels'];
  firstMajorInflowDay: number | null;
  currencyCode: string;
  formatSts: (amount: number, currency: string, options?: { prefix?: string }) => string;
}

export const CommittedStepBreakdown = ({
  committed,
  labels,
  firstMajorInflowDay,
  currencyCode,
  formatSts,
}: CommittedStepBreakdownProps) => {
  const { theme } = useTheme();
  const { openPlannedPayment } = useDashboardFeatureActions();

  const activeCommitted =
    committed?.filter(acc => acc.amount !== 0).sort((a, b) => b.amount - a.amount) ?? [];

  return (
    <View style={styles.container}>
      {activeCommitted.map((acc, i) => (
        <View key={i} style={styles.accountGroup}>
          <View style={styles.accountHeader}>
            <AppText variant="caption" weight="bold">
              {acc.accountName}
            </AppText>
            <AppText variant="caption" weight="bold" color="warning" tabular>
              {formatSts(acc.amount, currencyCode, { prefix: '–' })}
            </AppText>
          </View>
          <View style={styles.detailsList}>
            {acc.details
              .filter(det => det.amount !== 0)
              .map((det, di) => {
                const isPostIncome =
                  firstMajorInflowDay !== null &&
                  det.dayOffset !== undefined &&
                  det.dayOffset >= firstMajorInflowDay;
                const detailTypeLabel =
                  det.type === 'BUDGET'
                    ? 'Budget'
                    : det.type === 'PLANNED_PAYMENT'
                      ? 'Planned Payment'
                      : 'Transfer';

                return (
                  <TouchableOpacity
                    key={di}
                    style={styles.detailRow}
                    onPress={() => {
                      if (det.type === 'PLANNED_PAYMENT') {
                        openPlannedPayment(det.id, 'committed_breakdown');
                      }
                    }}
                    disabled={det.type !== 'PLANNED_PAYMENT'}
                    activeOpacity={Opacity.heavy}
                  >
                    <View style={styles.detailContent}>
                      <AppText variant="caption" weight="bold">
                        {det.name}
                      </AppText>
                      <View style={styles.badgeRow}>
                        <AppIcon
                          name={
                            det.type === 'BUDGET'
                              ? 'pieChart'
                              : det.type === 'PLANNED_PAYMENT'
                                ? 'calendar'
                                : 'refresh'
                          }
                          size={Size.xxs}
                          color={theme.textSecondary}
                        />
                        <AppText variant="caption" color="secondary">
                          {det.dayOffset !== undefined
                            ? `Day ${det.dayOffset} • ${detailTypeLabel}`
                            : detailTypeLabel}
                        </AppText>
                        {isPostIncome && (
                          <AppText variant="caption" color="success">
                            • {labels.waitingForIncome}
                          </AppText>
                        )}
                      </View>
                    </View>
                    <AppText variant="caption" color="secondary" tabular>
                      {formatSts(det.amount, currencyCode)}
                    </AppText>
                  </TouchableOpacity>
                );
              })}
          </View>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: Spacing.md,
  },
  accountGroup: {
    gap: Spacing.xs,
  },
  accountHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailsList: {
    gap: Spacing.sm,
    paddingLeft: Spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  detailContent: {
    flex: 1,
    gap: Spacing.xs,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
});
