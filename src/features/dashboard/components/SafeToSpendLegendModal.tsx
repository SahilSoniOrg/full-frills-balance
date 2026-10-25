import { InfoSheet } from '@/src/components/overlays/InfoSheet';
import { useStsMoneyFormat } from '@/src/components/shared/moneyFormat';
import { AppButton, AppText } from '@/src/components/core';
import { AppConfig, Opacity, Spacing, Typography } from '@/src/constants';
import { useDashboardFeatureActions } from '@/src/features/dashboard/hooks/useDashboardFeatureActions';
import { Separator } from '@/src/design-system';
import { StyleSheet, View } from 'react-native';
import { SafeToSpendViewModel } from '../types/SafeToSpendViewModel';
import { IncomeStepBreakdown, TimingGroupedBreakdown } from './explanation';

interface SafeToSpendLegendModalProps {
  visible: boolean;
  onClose: () => void;
  type: 'safe' | 'committed' | 'debts' | null;
  viewModel: SafeToSpendViewModel;
  onRequestExplanation: () => void;
}

export const SafeToSpendLegendModal = (props: SafeToSpendLegendModalProps) => {
  const { visible, onClose, type, viewModel, onRequestExplanation } = props;
  const { trackLegendToExplanation } = useDashboardFeatureActions();
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
  const formatSts = useStsMoneyFormat(isLoading);

  if (!type) return null;

  const title =
    type === 'safe'
      ? legendStrings.safeTitle
      : type === 'committed'
        ? legendStrings.committedTitle
        : legendStrings.debtsTitle;

  const flatCommitted = (committedBreakdown || []).flatMap(acc =>
    (acc?.details || [])
      .filter(detail => detail.amount !== 0)
      .map(detail => ({
        ...detail,
        accountName: acc.accountName,
      })),
  );

  const activeDebts = debtBreakdown.filter(debt => debt.amount !== 0);

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

          {incomeBreakdown.length > 0 ? (
            <View style={{ marginBottom: Spacing.lg }}>
              <AppText variant="overline" color="secondary" style={{ marginBottom: Spacing.md }}>
                {labels.upcomingIncome}
              </AppText>
              <IncomeStepBreakdown
                income={incomeBreakdown}
                labels={labels}
                currencyCode={currencyCode}
                formatSts={formatSts}
              />
            </View>
          ) : null}

          <AppButton
            variant="ghost"
            onPress={() => {
              trackLegendToExplanation('safe');
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
            <TimingGroupedBreakdown
              items={flatCommitted}
              firstMajorInflowDay={firstMajorInflowDay}
              formatTotal={total => formatSts(total, currencyCode)}
              totalColor="warning"
              renderItem={item => (
                <View style={styles.breakdownRow}>
                  <View style={{ flex: 1 }}>
                    <AppText variant="body" weight="bold">
                      {item.name}
                    </AppText>
                    <AppText variant="caption" color="secondary">
                      {item.type === 'BUDGET'
                        ? 'Category Budget'
                        : item.type === 'PLANNED_PAYMENT'
                          ? 'Scheduled Bill'
                          : 'Scheduled Transfer'}{' '}
                      • {item.accountName}
                    </AppText>
                  </View>
                  <AppText variant="body" weight="bold" color="warning">
                    {formatSts(item.amount, currencyCode)}
                  </AppText>
                </View>
              )}
            />

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

            <TimingGroupedBreakdown
              items={activeDebts}
              firstMajorInflowDay={firstMajorInflowDay}
              formatTotal={total => formatSts(total, currencyCode)}
              totalColor="error"
              renderItem={item => (
                <View style={styles.breakdownRow}>
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
              )}
            />

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
              <AppText variant="overline" color="secondary">
                {labels.totalBalanceInfo}
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
