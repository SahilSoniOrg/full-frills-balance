import { InfoSheet } from '@/src/components/common/InfoSheet';
import { useStsMoneyFormat } from '@/src/components/common/moneyFormat';
import { AppCard, AppIcon, AppText } from '@/src/components/core';
import { Opacity, Shape, Size, Spacing, Typography, withOpacity } from '@/src/constants';
import { Separator } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { analytics } from '@/src/services/analytics-service';
import { PlannedPaymentId } from '@/src/types/domain';
import { AppNavigation } from '@/src/utils/navigation';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeToSpendViewModel } from '../types/SafeToSpendViewModel';
import { SafeToSpendLedger } from './SafeToSpendLedger';

function parseFormulaItem(
  item: string | ((days: number) => string) | undefined,
  days: number,
): { title: string; detail: string } {
  const text = typeof item === 'function' ? item(days) : item || '';
  const colon = text.indexOf(': ');
  if (colon === -1) {
    return { title: text, detail: '' };
  }
  return { title: text.slice(0, colon), detail: text.slice(colon + 2) };
}

interface SafeToSpendExplanationModalProps {
  visible: boolean;
  onClose: () => void;
  viewModel: SafeToSpendViewModel;
  expandedSection: 'assets' | 'income' | 'committed' | 'debts' | null;
  setExpandedSection: (section: 'assets' | 'income' | 'committed' | 'debts' | null) => void;
}

export const SafeToSpendExplanationModal = ({
  visible,
  onClose,
  viewModel,
  expandedSection,
  setExpandedSection,
}: SafeToSpendExplanationModalProps) => {
  const {
    info,
    labels,
    totalLiquidAssets,
    totalFutureInflow,
    committedTotal,
    committedLiabilities,
    safeToSpend,
    totalLiabilities,
    accountSummaries,
    liquidAssetSubtypes,
    income,
    committed,
    debt,
    currencyCode,
    isLoading,
  } = viewModel;

  const formulaDays = viewModel.safeToSpendDays;

  const { theme } = useTheme();
  const formatSts = useStsMoneyFormat(isLoading);
  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        ledgerHeader: {
          padding: Spacing.xl,
          borderBottomWidth: 1,
          borderBottomColor: withOpacity(theme.border, Opacity.active),
          backgroundColor: withOpacity(theme.surfaceSecondary, Opacity.medium),
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.sm,
        },
        breakdownRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        },
        stepIcon: {
          width: 32,
          height: 32,
          borderRadius: 8,
          alignItems: 'center',
          justifyContent: 'center',
        },
        expandedContentRow: {
          paddingHorizontal: Spacing.xl,
          paddingBottom: Spacing.md,
        },
        benefitDot: {
          width: 6,
          height: 6,
          borderRadius: 3,
          marginTop: 8,
        },
        resultLine: {
          padding: Spacing.lg,
          backgroundColor: withOpacity(theme.surfaceSecondary, Opacity.medium),
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: Spacing.md,
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

  return (
    <InfoSheet
      visible={visible}
      title={info.title}
      onClose={onClose}
      accessibilityCloseLabel="Close safe-to-spend info"
      useNativeModal={false}
    >
      <AppText
        variant="body"
        color="secondary"
        style={{
          marginBottom: Spacing.sm,
          lineHeight: Typography.sizes.base * Typography.lineHeights.normal,
        }}
      >
        {info.intro}
      </AppText>
      <AppText
        variant="caption"
        color="secondary"
        testID="safe-to-spend-unlocks-copy"
        style={{
          marginBottom: Spacing.xl,
          lineHeight: Typography.sizes.sm * Typography.lineHeights.normal,
        }}
      >
        {info.unlocks}
      </AppText>

      <AppCard
        padding="none"
        elevation="lg"
        style={{
          marginBottom: Spacing.xl,
          borderRadius: Shape.radius.r3,
          borderWidth: 1,
          borderColor: withOpacity(theme.border, Opacity.muted),
          overflow: 'hidden',
        }}
      >
        <View style={styles.ledgerHeader}>
          <AppText variant="subheading">{info.bucketTitle}</AppText>
        </View>

        {/* Step 1: Assets */}
        <TouchableOpacity
          onPress={() => setExpandedSection(expandedSection === 'assets' ? null : 'assets')}
          accessibilityRole="button"
          accessibilityState={{ expanded: expandedSection === 'assets' }}
        >
          <View style={{ padding: Spacing.lg }}>
            <View style={styles.breakdownRow}>
              <View style={{ flex: 1 }}>
                <AppText variant="body" weight="medium">
                  {parseFormulaItem(info.formulaItems[0], formulaDays).title}
                </AppText>
                <AppText variant="caption" color="secondary">
                  {parseFormulaItem(info.formulaItems[0], formulaDays).detail}
                </AppText>
              </View>
              <AppText variant="subheading" color="primary" tabular>
                {formatSts(totalLiquidAssets, currencyCode)}
              </AppText>
              <AppIcon
                name={expandedSection === 'assets' ? 'chevronUp' : 'chevronDown'}
                size={Size.sm}
                color={theme.textSecondary}
              />
            </View>
          </View>
        </TouchableOpacity>
        {expandedSection === 'assets' && (
          <View style={styles.expandedContentRow}>
            <SafeToSpendLedger
              labels={labels}
              currencyCode={currencyCode}
              isLoading={isLoading}
              liquidAssetSubtypes={liquidAssetSubtypes}
              accountSummaries={accountSummaries}
            />
          </View>
        )}
        <Separator />

        {/* Step 2: Future Income */}
        <TouchableOpacity
          onPress={() => setExpandedSection(expandedSection === 'income' ? null : 'income')}
          accessibilityRole="button"
          accessibilityState={{ expanded: expandedSection === 'income' }}
        >
          <View style={{ padding: Spacing.lg }}>
            <View style={styles.breakdownRow}>
              <View style={{ flex: 1 }}>
                <AppText variant="body" weight="medium">
                  {parseFormulaItem(info.formulaItems[1], formulaDays).title}
                </AppText>
                <AppText variant="caption" color="secondary">
                  {parseFormulaItem(info.formulaItems[1], formulaDays).detail}
                </AppText>
              </View>
              <AppText variant="subheading" color="primary" tabular>
                {formatSts(totalFutureInflow, currencyCode)}
              </AppText>
              <AppIcon
                name={expandedSection === 'income' ? 'chevronUp' : 'chevronDown'}
                size={Size.sm}
                color={theme.textSecondary}
              />
            </View>
          </View>
        </TouchableOpacity>
        {expandedSection === 'income' && (
          <View style={styles.expandedContentRow}>
            <View style={{ gap: Spacing.sm }}>
              {income?.filter(inc => inc.amount !== 0).length > 0 ? (
                income
                  .filter(inc => inc.amount !== 0)
                  .map((inc, i) => (
                    <TouchableOpacity
                      key={i}
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                      onPress={() => {
                        if (inc.type === 'PLANNED_PAYMENT') {
                          analytics.trackFeatureUsage('safe_to_spend', 'planned_payment_viewed', {
                            id: inc.id,
                            source: 'income_breakdown',
                          });
                          AppNavigation.toPlannedPaymentDetails(inc.id as PlannedPaymentId);
                        }
                      }}
                      disabled={inc.type !== 'PLANNED_PAYMENT'}
                      activeOpacity={Opacity.heavy}
                    >
                      <View style={{ flex: 1 }}>
                        <AppText variant="caption" weight="bold">
                          {inc.name}
                        </AppText>
                        <View
                          style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.xs }}
                        >
                          <AppIcon
                            name={inc.type === 'PLANNED_PAYMENT' ? 'calendar' : 'refresh'}
                            size={Size.xxs}
                            color={theme.success}
                          />
                          <AppText variant="caption" color="secondary">
                            Day {inc.dayOffset} •{' '}
                            {inc.type === 'PLANNED_PAYMENT' ? 'Planned Payment' : 'Transfer'}
                          </AppText>
                        </View>
                      </View>
                      <AppText variant="caption" weight="bold" color="success" tabular>
                        {formatSts(inc.amount, currencyCode, { prefix: '+' })}
                      </AppText>
                    </TouchableOpacity>
                  ))
              ) : (
                <AppText variant="caption" color="secondary" italic>
                  {labels.noFutureIncome}
                </AppText>
              )}
            </View>
          </View>
        )}

        <Separator />

        {/* Step 3: Committed */}
        <TouchableOpacity
          onPress={() => setExpandedSection(expandedSection === 'committed' ? null : 'committed')}
          accessibilityRole="button"
          accessibilityState={{ expanded: expandedSection === 'committed' }}
        >
          <View style={{ padding: Spacing.lg }}>
            <View style={styles.breakdownRow}>
              <View style={{ flex: 1 }}>
                <AppText variant="body" weight="medium">
                  {parseFormulaItem(info.formulaItems[2], formulaDays).title}
                </AppText>
                <AppText variant="caption" color="secondary">
                  {parseFormulaItem(info.formulaItems[2], formulaDays).detail}
                </AppText>
              </View>
              <AppText variant="subheading" color="warning" tabular>
                {formatSts(committedTotal, currencyCode, { prefix: '–' })}
              </AppText>
              <AppIcon
                name={expandedSection === 'committed' ? 'chevronUp' : 'chevronDown'}
                size={Size.sm}
                color={theme.textSecondary}
              />
            </View>
          </View>
        </TouchableOpacity>
        {expandedSection === 'committed' && (
          <View style={styles.expandedContentRow}>
            <View style={{ gap: Spacing.md }}>
              {committed
                ?.filter(acc => acc.amount !== 0)
                .sort((a, b) => b.amount - a.amount)
                .map((acc, i) => (
                  <View key={i} style={{ gap: Spacing.xs }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <AppText variant="caption" weight="bold">
                        {acc.accountName}
                      </AppText>
                      <AppText variant="caption" weight="bold" color="warning" tabular>
                        {formatSts(acc.amount, currencyCode, { prefix: '–' })}
                      </AppText>
                    </View>
                    <View style={{ gap: Spacing.sm, paddingLeft: Spacing.sm }}>
                      {acc.details
                        .filter((det: any) => det.amount !== 0)
                        .map((det: any, di: number) => {
                          const firstMajorInflowDay = viewModel.insights.firstMajorInflowDay;
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
                              style={{
                                flexDirection: 'row',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                                gap: Spacing.sm,
                              }}
                              onPress={() => {
                                if (det.type === 'PLANNED_PAYMENT') {
                                  analytics.trackFeatureUsage(
                                    'safe_to_spend',
                                    'planned_payment_viewed',
                                    {
                                      id: det.id,
                                      source: 'committed_breakdown',
                                    },
                                  );
                                  AppNavigation.toPlannedPaymentDetails(det.id);
                                }
                              }}
                              disabled={det.type !== 'PLANNED_PAYMENT'}
                              activeOpacity={Opacity.heavy}
                            >
                              <View style={{ flex: 1, gap: Spacing.xs }}>
                                <AppText variant="caption" weight="bold">
                                  {det.name}
                                </AppText>
                                <View
                                  style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                    gap: Spacing.xs,
                                  }}
                                >
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
          </View>
        )}

        <Separator />

        {/* Step 4: Debts */}
        <TouchableOpacity
          onPress={() => setExpandedSection(expandedSection === 'debts' ? null : 'debts')}
          accessibilityRole="button"
          accessibilityState={{ expanded: expandedSection === 'debts' }}
        >
          <View style={{ padding: Spacing.lg }}>
            <View style={styles.breakdownRow}>
              <View style={{ flex: 1 }}>
                <AppText variant="body" weight="medium">
                  {parseFormulaItem(info.formulaItems[3], formulaDays).title}
                </AppText>
                <AppText variant="caption" color="secondary">
                  {parseFormulaItem(info.formulaItems[3], formulaDays).detail}
                </AppText>
              </View>
              <AppText variant="subheading" color="error" tabular>
                {formatSts(committedLiabilities, currencyCode, { prefix: '–' })}
              </AppText>
              <AppIcon
                name={expandedSection === 'debts' ? 'chevronUp' : 'chevronDown'}
                size={Size.sm}
                color={theme.textSecondary}
              />
            </View>
          </View>
        </TouchableOpacity>
        {expandedSection === 'debts' && (
          <View style={styles.expandedContentRow}>
            <AppText
              variant="caption"
              color="secondary"
              style={{ marginBottom: Spacing.md, opacity: Opacity.heavy, fontStyle: 'italic' }}
            >
              {labels.debtsHint}
            </AppText>

            <View style={{ gap: Spacing.md }}>
              {debt
                ?.filter(acc => acc.amount !== 0)
                .map((acc, i) => (
                  <View
                    key={i}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <AppText variant="caption" weight="bold">
                        {acc.accountName}
                      </AppText>
                      <AppText variant="caption" color="secondary">
                        {acc.type === 'FALLBACK'
                          ? labels.unplannedBalance
                          : labels.scheduledCommitment}
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
        )}

        {/* Result Line */}
        <View style={styles.resultLine}>
          <View style={{ flex: 1 }}>
            <AppText variant="body" weight="medium">
              {labels.safeToSpendLine.replace(':', '')}
            </AppText>
            <AppText variant="caption" color="secondary">
              {labels.remainingCashBuffer}
            </AppText>
          </View>
          <AppText variant="title" color="primary" tabular>
            {formatSts(safeToSpend, currencyCode)}
          </AppText>
        </View>
      </AppCard>

      <AppText
        variant="caption"
        italic
        color="secondary"
        style={{
          textAlign: 'center',
          paddingHorizontal: Spacing.md,
          lineHeight: 18,
          marginBottom: Spacing.xl,
        }}
      >
        {info.footer}
      </AppText>
    </InfoSheet>
  );
};

// Styles are now generated inside the component to access theme tokens.
