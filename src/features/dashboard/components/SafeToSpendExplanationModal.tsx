import { InfoSheet } from '@/src/components/overlays/InfoSheet';
import { useMoneyFormat, useStsMoneyFormat } from '@/src/components/shared/moneyFormat';
import { AppCard, AppText } from '@/src/components/core';
import { Opacity, Shape, Spacing, Typography } from '@/src/constants';
import { withOpacity } from '@/src/utils/color-math';
import { Separator } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import dayjs from 'dayjs';
import { SafeToSpendViewModel } from '../types/SafeToSpendViewModel';
import {
  CommittedStepBreakdown,
  DebtsStepBreakdown,
  FormulaStepRow,
  IncomeStepBreakdown,
} from './explanation';
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
    explanation,
    asOf,
    quality,
  } = viewModel;

  const formulaDays = viewModel.safeToSpendDays;
  const { theme } = useTheme();
  const formatSts = useStsMoneyFormat(isLoading);
  const formatMoney = useMoneyFormat({ loading: isLoading });

  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        introText: {
          marginBottom: Spacing.sm,
          lineHeight: Typography.sizes.base * Typography.lineHeights.normal,
        },
        unlocksText: {
          marginBottom: Spacing.xl,
          lineHeight: Typography.sizes.sm * Typography.lineHeights.normal,
        },
        card: {
          marginBottom: Spacing.xl,
          borderRadius: Shape.radius.r3,
          borderWidth: 1,
          borderColor: withOpacity(theme.border, Opacity.muted),
          overflow: 'hidden',
        },
        ledgerHeader: {
          padding: Spacing.xl,
          borderBottomWidth: 1,
          borderBottomColor: withOpacity(theme.border, Opacity.active),
          backgroundColor: withOpacity(theme.surfaceSecondary, Opacity.medium),
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.sm,
        },
        expandedContentRow: {
          paddingHorizontal: Spacing.xl,
          paddingBottom: Spacing.md,
        },
        resultLine: {
          padding: Spacing.lg,
          backgroundColor: withOpacity(theme.surfaceSecondary, Opacity.medium),
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: Spacing.md,
        },
        footerText: {
          textAlign: 'center',
          paddingHorizontal: Spacing.md,
          lineHeight: 18,
          marginBottom: Spacing.xl,
        },
      }),
    [theme],
  );

  const step1 = parseFormulaItem(info.formulaItems[0], formulaDays);
  const step2 = parseFormulaItem(info.formulaItems[1], formulaDays);
  const step3 = parseFormulaItem(info.formulaItems[2], formulaDays);
  const step4 = parseFormulaItem(info.formulaItems[3], formulaDays);

  return (
    <InfoSheet
      visible={visible}
      title={info.title}
      onClose={onClose}
      accessibilityCloseLabel="Close safe-to-spend info"
      useNativeModal={false}
    >
      <AppText variant="body" color="secondary" style={styles.introText}>
        {info.intro}
      </AppText>
      <AppText
        variant="caption"
        color="secondary"
        testID="safe-to-spend-unlocks-copy"
        style={styles.unlocksText}
      >
        {info.unlocks}
      </AppText>

      {explanation && (
        <AppCard paddingSize="lg" elevation="sm" style={styles.card}>
          <AppText variant="subheading">How this amount is constrained</AppText>
          <AppText variant="caption" color="secondary" style={styles.introText}>
            {asOf === undefined ? '' : `Based on ${dayjs(asOf).format('D MMM YYYY')}. `}
            Lowest dated balance over {explanation.horizonDays} days.{' '}
            {quality === 'stale' ? 'This is a saved estimate and may be out of date.' : ''}
          </AppText>
          <AppText variant="caption">
            Cash available now: {formatMoney(explanation.cashCeiling, currencyCode)}
          </AppText>
          <AppText variant="caption">
            {explanation.bindingDayOffset === null
              ? 'Binding limit: cash available now'
              : `Lowest projected balance · ${asOf === undefined ? `day ${explanation.bindingDayOffset + 1}` : dayjs(asOf).startOf('day').add(explanation.bindingDayOffset, 'day').format('D MMM YYYY')}`}
            : {formatMoney(explanation.minimumDatedBalance, currencyCode)}
          </AppText>
          {explanation.bindingDayOffset !== null &&
          explanation.assumedInflows.some(
            flow => flow.firstDayOffset > explanation.bindingDayOffset!,
          ) ? (
            <AppText variant="caption" color="secondary">
              Money arriving later does not cover bills due before it arrives.
            </AppText>
          ) : null}
          <AppText variant="caption">
            Held through the low point: {formatMoney(explanation.heldAmount, currencyCode)}
          </AppText>
          {explanation.shortfall > 0 && (
            <AppText variant="caption">
              Projected shortfall: {formatMoney(explanation.shortfall, currencyCode)}
            </AppText>
          )}
          {explanation.constrainingOutflows.map((flow, index) => (
            <AppText key={`out-${index}`} variant="caption">
              Included outflow: {flow.label} · {formatMoney(flow.amount, currencyCode)}
            </AppText>
          ))}
          {explanation.assumedInflows.map((flow, index) => (
            <AppText key={`in-${index}`} variant="caption">
              Expected inflow: {flow.label} · {formatMoney(flow.amount, currencyCode)} · first on{' '}
              {asOf === undefined
                ? `day ${flow.firstDayOffset + 1}`
                : dayjs(asOf).startOf('day').add(flow.firstDayOffset, 'day').format('D MMM YYYY')}
            </AppText>
          ))}
        </AppCard>
      )}

      <AppCard paddingSize="none" elevation="lg" style={styles.card}>
        <View style={styles.ledgerHeader}>
          <AppText variant="subheading">Supporting forecast inputs</AppText>
        </View>

        {/* Step 1: Assets */}
        <FormulaStepRow
          title={step1.title}
          detail={step1.detail}
          amountText={formatMoney(totalLiquidAssets, currencyCode)}
          amountColor="primary"
          isExpanded={expandedSection === 'assets'}
          onToggle={() => setExpandedSection(expandedSection === 'assets' ? null : 'assets')}
        />
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
        <FormulaStepRow
          title={step2.title}
          detail={step2.detail}
          amountText={formatSts(totalFutureInflow, currencyCode)}
          amountColor="primary"
          isExpanded={expandedSection === 'income'}
          onToggle={() => setExpandedSection(expandedSection === 'income' ? null : 'income')}
        />
        {expandedSection === 'income' && (
          <View style={styles.expandedContentRow}>
            <IncomeStepBreakdown
              income={income}
              labels={labels}
              currencyCode={currencyCode}
              formatSts={formatSts}
            />
          </View>
        )}
        <Separator />

        {/* Step 3: Committed */}
        <FormulaStepRow
          title={step3.title}
          detail={step3.detail}
          amountText={formatSts(committedTotal, currencyCode)}
          amountColor="warning"
          isExpanded={expandedSection === 'committed'}
          onToggle={() => setExpandedSection(expandedSection === 'committed' ? null : 'committed')}
        />
        {expandedSection === 'committed' && (
          <View style={styles.expandedContentRow}>
            <CommittedStepBreakdown
              committed={committed}
              labels={labels}
              firstMajorInflowDay={viewModel.insights.firstMajorInflowDay}
              currencyCode={currencyCode}
              formatSts={formatSts}
            />
          </View>
        )}
        <Separator />

        {/* Step 4: Debts */}
        <FormulaStepRow
          title={step4.title}
          detail={step4.detail}
          amountText={formatSts(committedLiabilities, currencyCode)}
          amountColor="error"
          isExpanded={expandedSection === 'debts'}
          onToggle={() => setExpandedSection(expandedSection === 'debts' ? null : 'debts')}
        />
        {expandedSection === 'debts' && (
          <View style={styles.expandedContentRow}>
            <DebtsStepBreakdown
              debt={debt}
              labels={labels}
              totalLiabilities={totalLiabilities}
              committedLiabilities={committedLiabilities}
              currencyCode={currencyCode}
              formatSts={formatSts}
            />
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

      <AppText variant="caption" italic color="secondary" style={styles.footerText}>
        {info.footer}
      </AppText>
    </InfoSheet>
  );
};
