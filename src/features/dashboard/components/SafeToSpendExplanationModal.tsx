import { InfoSheet } from '@/src/components/common/InfoSheet';
import { AppCard, AppIcon, AppText } from '@/src/components/core';
import { Opacity, Shape, Size, Spacing, Typography, withOpacity } from '@/src/constants';
import { Separator } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { AppNavigation } from '@/src/utils/navigation';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeToSpendLedger } from './SafeToSpendLedger';

interface SafeToSpendExplanationModalProps {
  visible: boolean;
  onClose: () => void;
  info: any;
  labels: any;
  formatValue: (val: number) => string | React.ReactNode;
  totalLiquidAssets: number;
  totalFutureInflow: number;
  committedBudget: number;
  committedPlanned: number;
  committedLiabilities: number;
  safeToSpend: number;
  liquidAssetSubtypes: any[];
  accountSummaries?: any[];
  incomeBreakdown: any[];
  committedBreakdown: any[];
  debtBreakdown: any[];
  firstMajorInflowDay: number | null;
  totalLiabilities: number;
  expandedSection: 'assets' | 'income' | 'committed' | 'debts' | null;
  setExpandedSection: (section: 'assets' | 'income' | 'committed' | 'debts' | null) => void;
}

export const SafeToSpendExplanationModal = ({
  visible,
  onClose,
  info,
  labels,
  formatValue,
  totalLiquidAssets,
  totalFutureInflow,
  committedBudget,
  committedPlanned,
  committedLiabilities,
  safeToSpend,
  liquidAssetSubtypes,
  accountSummaries,
  incomeBreakdown,
  committedBreakdown,
  debtBreakdown,
  firstMajorInflowDay,
  totalLiabilities,
  expandedSection,
  setExpandedSection,
}: SafeToSpendExplanationModalProps) => {
  const { theme } = useTheme();
  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        ledgerHeader: {
          padding: Spacing.xl,
          borderBottomWidth: 1,
          borderBottomColor: withOpacity(theme.border, 0.2),
          backgroundColor: withOpacity(theme.surfaceSecondary, 0.5),
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
          flex: 1,
          padding: Spacing.xl,
          backgroundColor: withOpacity(theme.surfaceSecondary, 0.5),
          borderTopWidth: 1,
          borderTopColor: withOpacity(theme.border, 0.2),
          borderStyle: 'solid',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        },
        liabilityCallout: {
          marginTop: Spacing.md,
          paddingHorizontal: Spacing.md,
          paddingVertical: Spacing.sm,
          backgroundColor: withOpacity(theme.expense, 0.05),
          borderRadius: Shape.radius.sm,
          borderLeftWidth: 3,
          borderLeftColor: theme.expense,
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
      primaryAction={{
        label: info.closeCta,
        variant: 'primary',
        onPress: onClose,
      }}
    >
      <AppText
        variant="heading"
        style={{
          marginTop: Spacing.md,
          marginBottom: Spacing.sm,
          fontFamily: Typography.fonts.heading,
          fontSize: Typography.sizes.xxxl,
          lineHeight: Typography.sizes.xxxl * 1.1,
          color: theme.primary,
        }}
      >
        Spend with confidence.
      </AppText>
      <AppText
        variant="body"
        color="secondary"
        style={{
          marginBottom: Spacing.xl,
          lineHeight: Typography.sizes.base * 1.5,
          opacity: 0.9,
        }}
      >
        {info.intro}
      </AppText>

      <AppCard
        padding="none"
        elevation="lg"
        style={{
          marginBottom: Spacing.xl,
          borderRadius: Shape.radius.r3,
          borderWidth: 1,
          borderColor: withOpacity(theme.border, 0.4),
          overflow: 'hidden',
        }}
      >
        <View style={styles.ledgerHeader}>
          <AppIcon name="calculator" size={Size.xs} color={theme.textTertiary} />
          <AppText variant="caption" weight="bold" color="secondary" style={{ letterSpacing: 1.5 }}>
            {labels.calculationLedger}
          </AppText>
        </View>

        {/* Step 1: Assets */}
        <TouchableOpacity
          style={{ flexDirection: 'row' }}
          onPress={() => setExpandedSection(expandedSection === 'assets' ? null : 'assets')}
        >
          <View style={{ width: 4, backgroundColor: theme.primary }} />
          <View style={{ flex: 1, padding: Spacing.xl }}>
            <View style={styles.breakdownRow}>
              <View
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}
              >
                <View
                  style={[styles.stepIcon, { backgroundColor: withOpacity(theme.primary, 0.1) }]}
                >
                  <AppIcon name="wallet" size={Size.sm} color={theme.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText
                    variant="caption"
                    weight="bold"
                    color="primary"
                    style={{ letterSpacing: 0.5, marginBottom: 2 }}
                  >
                    {info.formulaItems[0].split(': ')[0].toUpperCase()}
                  </AppText>
                  <AppText variant="caption" color="secondary">
                    {info.formulaItems[0].split(': ')[1]}
                  </AppText>
                </View>
              </View>
              <AppText
                variant="subheading"
                color="primary"
                tabular
                style={{ fontFamily: Typography.fonts.heading }}
              >
                {formatValue(totalLiquidAssets)}
              </AppText>
            </View>
          </View>
        </TouchableOpacity>
        {expandedSection === 'assets' && (
          <View style={styles.expandedContentRow}>
            <SafeToSpendLedger
              labels={labels}
              formatValue={formatValue}
              liquidAssetSubtypes={liquidAssetSubtypes}
              accountSummaries={accountSummaries}
            />
          </View>
        )}
        <Separator />

        {/* Step 2: Future Income */}
        <TouchableOpacity
          style={{ flexDirection: 'row' }}
          onPress={() => setExpandedSection(expandedSection === 'income' ? null : 'income')}
        >
          <View style={{ width: 4, backgroundColor: theme.primary }} />
          <View style={{ flex: 1, padding: Spacing.xl }}>
            <View style={styles.breakdownRow}>
              <View
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}
              >
                <View
                  style={[styles.stepIcon, { backgroundColor: withOpacity(theme.primary, 0.1) }]}
                >
                  <AppIcon name="trendingUp" size={Size.sm} color={theme.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText
                    variant="caption"
                    weight="bold"
                    color="primary"
                    style={{ letterSpacing: 0.5, marginBottom: 2 }}
                  >
                    {labels.upcomingIncome.toUpperCase()}
                  </AppText>
                  <AppText variant="caption" color="secondary">
                    {info.formulaItems[1]
                      ? info.formulaItems[1].split(': ')[1]
                      : 'Predicted inflows'}
                  </AppText>
                </View>
              </View>
              <AppText
                variant="subheading"
                color="primary"
                tabular
                style={{ fontFamily: Typography.fonts.heading }}
              >
                {formatValue(totalFutureInflow)}
              </AppText>
            </View>
          </View>
        </TouchableOpacity>
        {expandedSection === 'income' && (
          <View style={styles.expandedContentRow}>
            <View style={{ gap: Spacing.sm }}>
              {incomeBreakdown.filter(inc => inc.amount !== 0).length > 0 ? (
                incomeBreakdown
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
                          AppNavigation.toPlannedPaymentDetails(inc.id);
                        }
                      }}
                      disabled={inc.type !== 'PLANNED_PAYMENT'}
                      activeOpacity={0.7}
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
                            size={10}
                            color={withOpacity(theme.success, 0.7)}
                          />
                          <AppText variant="caption" color="secondary" style={{ fontSize: 9 }}>
                            Day {inc.dayOffset} •{' '}
                            {inc.type === 'PLANNED_PAYMENT' ? 'Planned Payment' : 'Transfer'}
                          </AppText>
                        </View>
                      </View>
                      <AppText variant="caption" weight="bold" color="success" tabular>
                        +{formatValue(inc.amount)}
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
          style={{ flexDirection: 'row' }}
          onPress={() => setExpandedSection(expandedSection === 'committed' ? null : 'committed')}
        >
          <View style={{ width: 4, backgroundColor: theme.warning }} />
          <View style={{ flex: 1, padding: Spacing.xl }}>
            <View style={styles.breakdownRow}>
              <View
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}
              >
                <View
                  style={[styles.stepIcon, { backgroundColor: withOpacity(theme.warning, 0.1) }]}
                >
                  <AppIcon name="lock" size={Size.sm} color={theme.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText
                    variant="caption"
                    weight="bold"
                    color="warning"
                    style={{ letterSpacing: 0.5, marginBottom: 2 }}
                  >
                    {labels.committedLine.split(' (')[0].toUpperCase()}
                  </AppText>
                  <AppText variant="caption" color="secondary">
                    {info.formulaItems[2]
                      ? info.formulaItems[2].split(': ')[1]
                      : 'Bills and Budgets'}
                  </AppText>
                </View>
              </View>
              <AppText
                variant="subheading"
                color="warning"
                tabular
                style={{ fontFamily: Typography.fonts.heading }}
              >
                –{formatValue(committedBudget + committedPlanned)}
              </AppText>
            </View>
          </View>
        </TouchableOpacity>
        {expandedSection === 'committed' && (
          <View style={styles.expandedContentRow}>
            <View style={{ gap: Spacing.md }}>
              {committedBreakdown
                .filter(acc => acc.amount !== 0)
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
                        –{formatValue(acc.amount)}
                      </AppText>
                    </View>
                    <View style={{ gap: Spacing.sm, paddingLeft: Spacing.sm }}>
                      {acc.details
                        .filter((det: any) => det.amount !== 0)
                        .map((det: any, di: number) => {
                          const isPostIncome =
                            firstMajorInflowDay !== null &&
                            det.dayOffset !== undefined &&
                            det.dayOffset >= firstMajorInflowDay;
                          return (
                            <TouchableOpacity
                              key={di}
                              style={{
                                flexDirection: 'row',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                minHeight: 18,
                              }}
                              onPress={() => {
                                if (det.type === 'PLANNED_PAYMENT') {
                                  AppNavigation.toPlannedPaymentDetails(det.id);
                                }
                              }}
                              disabled={det.type !== 'PLANNED_PAYMENT'}
                              activeOpacity={0.7}
                            >
                              <View
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  gap: Spacing.sm,
                                  flex: 1,
                                  paddingRight: Spacing.xs,
                                }}
                              >
                                <View
                                  style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: Spacing.xs,
                                    flex: 1,
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
                                    size={10}
                                    color={theme.textSecondary}
                                  />
                                  <AppText
                                    variant="caption"
                                    color="secondary"
                                    style={{ fontSize: 10, lineHeight: 14 }}
                                  >
                                    {det.name}
                                  </AppText>
                                  <AppText
                                    style={{
                                      fontSize: 8,
                                      opacity: Opacity.medium,
                                      color: theme.textSecondary,
                                    }}
                                  >
                                    {det.type === 'BUDGET'
                                      ? 'Budget'
                                      : det.type === 'PLANNED_PAYMENT'
                                        ? 'Bill'
                                        : 'Plan'}
                                  </AppText>
                                  {isPostIncome && (
                                    <View
                                      style={{
                                        backgroundColor: withOpacity(theme.success, 0.1),
                                        paddingHorizontal: 6,
                                        paddingVertical: 2,
                                        borderRadius: 4,
                                        marginLeft: Spacing.xs,
                                      }}
                                    >
                                      <AppText
                                        weight="bold"
                                        style={{ fontSize: 8, color: theme.success }}
                                      >
                                        {labels.waitingForIncome}
                                      </AppText>
                                    </View>
                                  )}
                                </View>
                              </View>
                              <AppText
                                variant="caption"
                                color="secondary"
                                tabular
                                style={{ fontSize: 10, lineHeight: 14 }}
                              >
                                {formatValue(det.amount)}
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
          style={{ flexDirection: 'row' }}
          onPress={() => setExpandedSection(expandedSection === 'debts' ? null : 'debts')}
        >
          <View style={{ width: 4, backgroundColor: theme.error }} />
          <View style={{ flex: 1, padding: Spacing.xl }}>
            <View style={styles.breakdownRow}>
              <View
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}
              >
                <View style={[styles.stepIcon, { backgroundColor: withOpacity(theme.error, 0.1) }]}>
                  <AppIcon name="error" size={Size.sm} color={theme.error} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText
                    variant="caption"
                    weight="bold"
                    color="error"
                    style={{ letterSpacing: 0.5, marginBottom: 2 }}
                  >
                    {labels.debtsBucket.toUpperCase()}
                  </AppText>
                  <AppText variant="caption" color="secondary">
                    {info.formulaItems[3]
                      ? info.formulaItems[3].split(': ')[1]
                      : 'Short-term liabilities'}
                  </AppText>
                </View>
              </View>
              <AppText
                variant="subheading"
                color="error"
                tabular
                style={{ fontFamily: Typography.fonts.heading }}
              >
                –{formatValue(committedLiabilities)}
              </AppText>
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
              {debtBreakdown
                .filter(acc => acc.amount !== 0)
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
                      –{formatValue(acc.amount)}
                    </AppText>
                  </View>
                ))}
            </View>

            {totalLiabilities > committedLiabilities && (
              <View style={styles.liabilityCallout}>
                <AppText variant="caption" color="secondary" style={{ lineHeight: 16 }}>
                  <AppText variant="caption" weight="bold" tabular>
                    {formatValue(totalLiabilities - committedLiabilities)}{' '}
                  </AppText>
                  {labels.debtsCallout}
                </AppText>
              </View>
            )}
          </View>
        )}

        {/* Result Line */}
        <View style={{ flexDirection: 'row' }}>
          <View style={{ width: 4, backgroundColor: theme.primary }} />
          <View style={styles.resultLine}>
            <View style={{ flex: 1 }}>
              <AppText
                variant="caption"
                weight="bold"
                color="primary"
                style={{ letterSpacing: 1.5, marginBottom: Spacing.xs }}
              >
                SAFE TO SPEND
              </AppText>
              <AppText
                variant="caption"
                color="secondary"
                style={{ fontStyle: 'italic', opacity: Opacity.heavy }}
              >
                {labels.remainingCashBuffer}
              </AppText>
            </View>
            <AppText
              variant="hero"
              color="primary"
              tabular
              style={{
                fontFamily: Typography.fonts.heading,
                fontSize: Typography.sizes.xxxl,
                textAlign: 'right',
              }}
            >
              {formatValue(safeToSpend)}
            </AppText>
          </View>
        </View>
      </AppCard>

      <View style={{ paddingHorizontal: Spacing.sm }}>
        <AppText
          variant="body"
          weight="bold"
          style={{ marginBottom: Spacing.lg, color: theme.primary, letterSpacing: 1 }}
        >
          {info.benefitsTitle.toUpperCase()}
        </AppText>
        <View style={{ gap: Spacing.lg }}>
          {info.benefits.map((item: string, index: number) => {
            const [title, content] = item.split(': ');
            return (
              <View key={index} style={{ flexDirection: 'row', gap: Spacing.md }}>
                <View
                  style={[styles.benefitDot, { backgroundColor: theme.primary, marginTop: 8 }]}
                />
                <View style={{ flex: 1 }}>
                  <AppText variant="body" weight="bold">
                    {title}
                  </AppText>
                  <AppText
                    variant="caption"
                    color="secondary"
                    style={{ marginTop: Spacing.xs / 2, lineHeight: 18 }}
                  >
                    {content}
                  </AppText>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      <View style={{ paddingVertical: Spacing.xxxxl, alignItems: 'center' }}>
        <Separator
          background="border"
          space={1}
          opacity={0.3}
          style={{ width: 40, marginBottom: Spacing.lg }}
        />
        <AppText
          variant="caption"
          italic
          color="secondary"
          style={{
            textAlign: 'center',
            opacity: 0.8,
            paddingHorizontal: Spacing.xl,
            lineHeight: 18,
          }}
        >
          {info.footer}
        </AppText>
      </View>
    </InfoSheet>
  );
};

// Styles are now generated inside the component to access theme tokens.
