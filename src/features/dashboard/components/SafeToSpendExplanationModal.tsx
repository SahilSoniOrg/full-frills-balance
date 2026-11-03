import { InfoSheet } from '@/src/components/overlays/InfoSheet';
import { IncompleteFxWarning } from '@/src/components/shared/IncompleteFxWarning';
import { useMoneyFormat, useStsMoneyFormat } from '@/src/components/shared/moneyFormat';
import { AppCard, AppText, ListGroup, ListRow } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Spacing, Typography } from '@/src/constants';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { safeToSpendNotices } from '@/src/features/dashboard/safeToSpendNotices';
import { withOpacity } from '@/src/utils/color-math';
import { formatDate } from '@/src/utils/dateUtils';
import { showIncompleteFxDetails } from '@/src/utils/incompleteFxDetails';
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
import { SafeToSpendForecastDetails } from './SafeToSpendForecastDetails';

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
    shortfall,
    isOverCommitted,
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
    staleReason,
  } = viewModel;

  const formulaDays = viewModel.safeToSpendDays;
  const { workplaceId } = useWorkplace();
  const { theme } = useTheme();
  const notices = safeToSpendNotices({
    quality: viewModel.quality ?? 'ready',
    staleReason,
    latestActiveJournalAt: viewModel.latestActiveJournalAt,
  });
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
        forecastDetails: {
          marginBottom: Spacing.lg,
          gap: Spacing.xs,
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

  const constraint = AppConfig.strings.dashboard.safeToSpendConstraint;
  const money = (amount: number) => formatMoney(amount, currencyCode);
  const formatForecastDay = (dayOffset: number) =>
    asOf === undefined
      ? constraint.forecastDay(dayOffset + 1)
      : formatDate(dayjs(asOf).startOf('day').add(dayOffset, 'day').valueOf());

  return (
    <InfoSheet
      visible={visible}
      title={info.title}
      onClose={onClose}
      accessibilityCloseLabel="Close safe-to-spend info"
    >
      {notices.length > 0 ||
      asOf !== undefined ||
      viewModel.snapshotAgeMs !== undefined ||
      viewModel.hasUnvaluedEntries ? (
        <View style={styles.forecastDetails}>
          {notices.map(notice => (
            <AppText key={notice.id} testID={notice.id} variant="caption" color="warning">
              {notice.message}
            </AppText>
          ))}
          {asOf !== undefined || viewModel.snapshotAgeMs !== undefined ? (
            <SafeToSpendForecastDetails viewModel={viewModel} />
          ) : null}
          {viewModel.hasUnvaluedEntries ? (
            <IncompleteFxWarning
              testID="safe-to-spend-incomplete-warning"
              message={AppConfig.strings.dashboard.safeToSpendUi.incompleteEstimateWarning}
              onPress={() => {
                onClose();
                showIncompleteFxDetails({
                  context: 'safe-to-spend',
                  workplaceId,
                  currencyCode,
                  unvaluedStartingBalances: (viewModel.unvaluedStartingBalances ?? []).map(
                    balance => ({
                      accountId: balance.accountId,
                      accountName: balance.accountName,
                      fromCurrency: balance.fromCurrency,
                      toCurrency: balance.toCurrency,
                      amountLabel: formatMoney(balance.amount, balance.fromCurrency),
                    }),
                  ),
                });
              }}
            />
          ) : null}
        </View>
      ) : null}
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
          <AppText variant="subheading">{constraint.title}</AppText>
          <AppText variant="caption" color="secondary" style={styles.introText}>
            {constraint.horizon(explanation.horizonDays)}
          </AppText>
          <ListGroup variant="plain" dividerInset="none">
            <ListRow
              title={constraint.cashAvailableNow}
              testID="safe-to-spend-cash-available-row"
              accessibilityLabel={`${constraint.cashAvailableNow}, ${money(explanation.cashCeiling)}`}
              trailing={<ListRow.Value>{money(explanation.cashCeiling)}</ListRow.Value>}
            />
            <ListRow
              title={
                explanation.bindingDayOffset === null
                  ? constraint.cashCeilingBinds
                  : constraint.lowestProjectedBalance(
                      formatForecastDay(explanation.bindingDayOffset),
                    )
              }
              trailing={
                <ListRow.Value color={explanation.minimumDatedBalance < 0 ? 'error' : undefined}>
                  {money(explanation.minimumDatedBalance)}
                </ListRow.Value>
              }
            />
            <ListRow
              title={constraint.heldThroughLowPoint}
              trailing={<ListRow.Value>{money(explanation.heldAmount)}</ListRow.Value>}
            />
            {explanation.shortfall > 0 && (
              <ListRow
                title={constraint.projectedShortfall}
                trailing={
                  <ListRow.Value color="error">{money(explanation.shortfall)}</ListRow.Value>
                }
              />
            )}
            {explanation.constrainingOutflows.map(flow => (
              <ListRow
                key={`out-${flow.source}-${flow.label}`}
                title={flow.label}
                subtitle={constraint.includedOutflow}
                trailing={<ListRow.Value color="expense">{money(flow.amount)}</ListRow.Value>}
              />
            ))}
            {explanation.assumedInflows.map(flow => (
              <ListRow
                key={`in-${flow.source}-${flow.label}`}
                title={flow.label}
                subtitle={constraint.expectedInflow(formatForecastDay(flow.firstDayOffset))}
                trailing={<ListRow.Value color="income">{money(flow.amount)}</ListRow.Value>}
              />
            ))}
          </ListGroup>
          {explanation.bindingDayOffset !== null &&
          explanation.assumedInflows.some(
            flow => flow.firstDayOffset > explanation.bindingDayOffset!,
          ) ? (
            <AppText variant="caption" color="secondary">
              {constraint.laterIncomeNote}
            </AppText>
          ) : null}
        </AppCard>
      )}

      <AppCard paddingSize="none" elevation="lg" style={styles.card}>
        <View style={styles.ledgerHeader}>
          <AppText variant="subheading">{info.bucketTitle}</AppText>
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
              {isOverCommitted
                ? AppConfig.strings.dashboard.shortfall
                : labels.safeToSpendLine.replace(':', '')}
            </AppText>
            <AppText variant="caption" color="secondary">
              {labels.remainingCashBuffer}
            </AppText>
          </View>
          <AppText
            variant="title"
            fontRole="numeric"
            weight="semibold"
            color={isOverCommitted ? 'error' : 'primary'}
            tabular
          >
            {isOverCommitted
              ? formatSts(shortfall, currencyCode, { prefix: '–' })
              : formatSts(safeToSpend, currencyCode)}
          </AppText>
        </View>
      </AppCard>

      <AppText variant="caption" italic color="secondary" style={styles.footerText}>
        {info.footer}
      </AppText>
    </InfoSheet>
  );
};
