import { InfoSheet } from '@/src/components/common/InfoSheet';
import { useMoneyFormat } from '@/src/components/common/moneyFormat';
import { AppButton, AppText } from '@/src/components/core';
import { AppConfig, Opacity, Spacing, Typography } from '@/src/constants';
import { analytics } from '@/src/services/analytics-service';
import { Separator } from '@/src/design-system';
import { StyleSheet, View } from 'react-native';
import { SafeToSpendViewModel } from '../types/SafeToSpendViewModel';

interface SafeToSpendLegendModalProps {
  visible: boolean;
  onClose: () => void;
  type: 'safe' | 'committed' | 'debts' | null;
  viewModel: SafeToSpendViewModel;
  onRequestExplanation: () => void;
}

export const SafeToSpendLegendModal = (props: SafeToSpendLegendModalProps) => {
  const { visible, onClose, type, viewModel, onRequestExplanation } = props;
  const {
    labels,
    committedTotal,
    committedLiabilities,
    safeToSpend,
    totalLiabilities,
    insights,
    income: incomeBreakdown,
    committed: committedBreakdown,
    debt: debtBreakdown,
    safeToSpendDays,
    currencyCode,
    isLoading,
  } = viewModel;

  const { firstMajorInflowDay, committedLiabilitiesCC, committedLiabilitiesOther } = insights;

  const strings = AppConfig.strings.dashboard;
  const legendStrings = strings.legendDetails;
  const formatSts = useMoneyFormat({ style: 'sts', loading: isLoading });

  if (!type) return null;

  const title =
    type === 'safe'
      ? legendStrings.safeTitle
      : type === 'committed'
        ? legendStrings.committedTitle
        : legendStrings.debtsTitle;

  return (
    <InfoSheet
      visible={visible}
      title={title}
      onClose={onClose}
      accessibilityCloseLabel="Close breakdown details"
    >
      {type === 'safe' && (
        <View style={styles.modalSection}>
          <AppText variant="body" style={{ marginBottom: Spacing.md, lineHeight: 22 }}>
            {legendStrings.safeDesc(safeToSpendDays)}
          </AppText>

          <View style={[styles.breakdownRow, { marginBottom: Spacing.lg }]}>
            <AppText variant="subheading">{legendStrings.safeTitle}</AppText>
            <AppText variant="subheading" color="primary" tabular>
              {formatSts(safeToSpend, currencyCode)}
            </AppText>
          </View>

          {incomeBreakdown.length > 0 && (
            <View style={{ marginBottom: Spacing.lg }}>
              <AppText
                variant="caption"
                weight="bold"
                color="secondary"
                style={{ textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.md }}
              >
                {labels.upcomingIncome.toUpperCase()}
              </AppText>
              <View style={{ gap: Spacing.md }}>
                {incomeBreakdown
                  .filter(inc => inc.amount !== 0)
                  .map((inc, i) => (
                    <View key={i} style={styles.breakdownRow}>
                      <View style={{ flex: 1 }}>
                        <AppText variant="caption" weight="bold">
                          {inc.name}
                        </AppText>
                        <AppText variant="caption" color="secondary">
                          Day {inc.dayOffset} •{' '}
                          {inc.type === 'PLANNED_PAYMENT' ? 'Planned Payment' : 'Transfer'}
                        </AppText>
                      </View>
                      <AppText variant="caption" weight="bold" color="success" tabular>
                        +{formatSts(inc.amount, currencyCode)}
                      </AppText>
                    </View>
                  ))}
              </View>
            </View>
          )}

          <AppButton
            variant="ghost"
            onPress={() => {
              analytics.trackFeatureUsage('safe_to_spend', 'legend_to_explanation', {
                slice: 'safe',
              });
              onRequestExplanation();
            }}
            accessibilityLabel={strings.safeToSpendExplanation.title}
          >
            {strings.safeToSpendExplanation.title}
          </AppButton>
        </View>
      )}

      {type === 'committed' && (
        <View style={styles.modalSection}>
          <AppText variant="body" style={{ marginBottom: Spacing.md }}>
            {legendStrings.committedDesc(safeToSpendDays)}
          </AppText>

          <View style={{ gap: Spacing.md }}>
            {(() => {
              const flatCommitted = (committedBreakdown || []).flatMap(acc =>
                (acc?.details || [])
                  .filter((d: any) => d.amount !== 0)
                  .map((d: any) => ({
                    ...d,
                    accountName: acc.accountName,
                  })),
              );

              const beforeIncome = flatCommitted.filter(
                d => (d.dayOffset ?? 0) < (firstMajorInflowDay || 0),
              );
              const afterIncome = flatCommitted.filter(
                d => (d.dayOffset ?? 0) >= (firstMajorInflowDay || 0),
              );

              const renderGroup = (items: typeof flatCommitted, title: string) => {
                if (items.length === 0) return null;
                const total = items.reduce((sum, item) => sum + item.amount, 0);

                return (
                  <View key={title} style={{ marginBottom: Spacing.xl }}>
                    <View style={[styles.breakdownRow, { marginBottom: Spacing.sm }]}>
                      <AppText
                        variant="caption"
                        weight="bold"
                        color="secondary"
                        style={{ textTransform: 'uppercase', letterSpacing: 1 }}
                      >
                        {title}
                      </AppText>
                      <AppText variant="caption" weight="bold" color="warning">
                        {formatSts(total, currencyCode)}
                      </AppText>
                    </View>
                    <View style={{ gap: Spacing.md }}>
                      {items.map(item => (
                        <View key={item.id} style={styles.breakdownRow}>
                          <View style={{ flex: 1 }}>
                            <AppText variant="body" weight="bold">
                              {item.name}
                            </AppText>
                            <AppText variant="caption" color="secondary">
                              {item.type === 'BUDGET'
                                ? 'Budget Reserve'
                                : item.type === 'PLANNED_PAYMENT'
                                  ? 'Planned Payment'
                                  : 'Planned Transfer'}{' '}
                              • {item.accountName}
                            </AppText>
                          </View>
                          <AppText variant="body" weight="bold" color="warning">
                            {formatSts(item.amount, currencyCode)}
                          </AppText>
                        </View>
                      ))}
                    </View>
                  </View>
                );
              };

              return (
                <>
                  {renderGroup(beforeIncome, 'Due Before Major Income')}
                  {firstMajorInflowDay !== null &&
                    renderGroup(afterIncome, 'Due After Major Income')}
                </>
              );
            })()}

            <Separator marginVertical="xs" opacity={Opacity.muted} />
            <View style={styles.breakdownRow}>
              <AppText variant="body" weight="bold" style={{ fontSize: Typography.sizes.lg }}>
                {labels.totalCommitted}
              </AppText>
              <AppText
                variant="body"
                weight="bold"
                color="warning"
                style={{ fontSize: Typography.sizes.lg }}
              >
                {formatSts(committedTotal, currencyCode)}
              </AppText>
            </View>
          </View>
        </View>
      )}

      {type === 'debts' && (
        <View style={styles.modalSection}>
          <AppText variant="body" style={{ marginBottom: Spacing.md }}>
            {legendStrings.debtsDesc(safeToSpendDays)}
          </AppText>

          <View style={{ gap: Spacing.md }}>
            <View style={styles.breakdownRow}>
              <AppText variant="body" weight="medium">
                {labels.creditCardStatements}
              </AppText>
              <AppText variant="body" weight="bold">
                {formatSts(committedLiabilitiesCC, currencyCode)}
              </AppText>
            </View>
            <View style={styles.breakdownRow}>
              <AppText variant="body" weight="medium">
                {labels.otherLiquidLiabilities}
              </AppText>
              <AppText variant="body" weight="bold">
                {formatSts(committedLiabilitiesOther, currencyCode)}
              </AppText>
            </View>

            <Separator marginVertical="xl" opacity={Opacity.muted} />

            {(() => {
              const beforeIncome = debtBreakdown.filter(
                d => d.amount !== 0 && (d.dayOffset ?? 0) < (firstMajorInflowDay || 0),
              );
              const afterIncome = debtBreakdown.filter(
                d => d.amount !== 0 && (d.dayOffset ?? 0) >= (firstMajorInflowDay || 0),
              );

              const renderGroup = (items: typeof debtBreakdown, title: string) => {
                if (items.length === 0) return null;
                const total = items.reduce((sum, item) => sum + item.amount, 0);

                return (
                  <View key={title} style={{ marginBottom: Spacing.xl }}>
                    <View style={[styles.breakdownRow, { marginBottom: Spacing.sm }]}>
                      <AppText
                        variant="caption"
                        weight="bold"
                        color="secondary"
                        style={{ textTransform: 'uppercase', letterSpacing: 1 }}
                      >
                        {title}
                      </AppText>
                      <AppText variant="caption" weight="bold" color="error">
                        {formatSts(total, currencyCode)}
                      </AppText>
                    </View>
                    <View style={{ gap: Spacing.md }}>
                      {items.map(item => (
                        <View key={item.accountId} style={styles.breakdownRow}>
                          <View style={{ flex: 1 }}>
                            <AppText variant="body" weight="bold">
                              {item.accountName}
                            </AppText>
                            <AppText variant="caption" color="secondary">
                              {item.type === 'FALLBACK'
                                ? labels.unplannedBalance
                                : labels.scheduledCommitment}{' '}
                              • Day {item.dayOffset}
                            </AppText>
                          </View>
                          <AppText variant="body" weight="bold" color="error">
                            {formatSts(item.amount, currencyCode)}
                          </AppText>
                        </View>
                      ))}
                    </View>
                  </View>
                );
              };

              return (
                <>
                  {renderGroup(beforeIncome, 'Due Before Major Income')}
                  {firstMajorInflowDay !== null &&
                    renderGroup(afterIncome, 'Due After Major Income')}
                </>
              );
            })()}

            <Separator marginVertical="xs" opacity={Opacity.muted} />

            <View style={styles.breakdownRow}>
              <AppText variant="body" weight="bold" style={{ fontSize: Typography.sizes.lg }}>
                {labels.debtsBucket}
              </AppText>
              <AppText
                variant="body"
                weight="bold"
                color="error"
                style={{ fontSize: Typography.sizes.lg }}
              >
                {formatSts(committedLiabilities, currencyCode)}
              </AppText>
            </View>
            <Separator marginVertical="md" opacity={Opacity.muted} />
            <View style={styles.breakdownRow}>
              <AppText variant="caption" color="secondary" weight="bold">
                {labels.totalBalanceInfo.toUpperCase()}
              </AppText>
              <AppText variant="body" color="secondary" weight="bold">
                {formatSts(totalLiabilities, currencyCode)}
              </AppText>
            </View>
          </View>
        </View>
      )}
    </InfoSheet>
  );
};

const styles = StyleSheet.create({
  modalSection: {
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
