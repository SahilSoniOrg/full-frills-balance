import { InfoSheet } from '@/src/components/common/InfoSheet';
import { useStsMoneyFormat } from '@/src/components/common/moneyFormat';
import { AppCard, AppText } from '@/src/components/core';
import { Opacity, Shape, Spacing, Typography, withOpacity } from '@/src/constants';
import { Separator } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet, View } from 'react-native';
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
  } = viewModel;

  const formulaDays = viewModel.safeToSpendDays;
  const { theme } = useTheme();
  const formatSts = useStsMoneyFormat(isLoading);

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

      <AppCard paddingSize="none" elevation="lg" style={styles.card}>
        <View style={styles.ledgerHeader}>
          <AppText variant="subheading">{info.bucketTitle}</AppText>
        </View>

        {/* Step 1: Assets */}
        <FormulaStepRow
          title={step1.title}
          detail={step1.detail}
          amountText={formatSts(totalLiquidAssets, currencyCode)}
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
          amountText={formatSts(committedTotal, currencyCode, { prefix: '–' })}
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
          amountText={formatSts(committedLiabilities, currencyCode, { prefix: '–' })}
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
