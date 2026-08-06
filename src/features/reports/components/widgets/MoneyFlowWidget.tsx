import { useMoneyFormat } from '@/src/components/common/moneyFormat';
import { MoneyText } from '@/src/components/common/MoneyText';
import { SankeyChart } from '@/src/components/charts/SankeyChart';
import {
  getSankeyNodeAmount,
  partitionSankeyNodes,
  prepareSankeyChartData,
} from '@/src/components/charts/sankeyLayout';
import { AppText } from '@/src/components/core';
import { AppConfig, Spacing } from '@/src/constants';
import { ReportChartCard } from '@/src/features/reports/components/ReportChartCard';
import { useTheme } from '@/src/hooks/use-theme';
import { SankeyData, SankeyLink, SankeyNode } from '@/src/services/reports/reportSnapshot';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

export interface MoneyFlowWidgetProps {
  sankeyData: SankeyData;
  currencyCode: string;
  chartWidth: number;
}

function formatPercentLabel(percent?: number): string {
  if (percent === undefined) return '';
  if (percent > 0 && percent < 1) return '<1%';
  return `${Math.round(percent)}%`;
}

export function MoneyFlowWidget({ sankeyData, currencyCode, chartWidth }: MoneyFlowWidgetProps) {
  const { theme } = useTheme();
  const { summary, nodes, links } = sankeyData;
  const hasData = nodes.length > 0 && links.length > 0;
  const formatMoneyShort = useMoneyFormat({ style: 'short' });
  const chartData = useMemo(() => prepareSankeyChartData(sankeyData), [sankeyData]);
  const { income, spending } = partitionSankeyNodes(nodes, links);

  return (
    <ReportChartCard title={AppConfig.strings.reports.moneyFlowTitle} zIndex={20}>
      {hasData ? (
        <>
          <SankeyChart nodes={chartData.nodes} links={chartData.links} width={chartWidth} />

          <View style={styles.legend}>
            <LegendColumn
              title={AppConfig.strings.reports.sankeyIncomeColumn}
              nodes={income}
              links={links}
              currencyCode={currencyCode}
              formatMoneyShort={formatMoneyShort}
            />
            <LegendColumn
              title={AppConfig.strings.reports.sankeySpendingColumn}
              nodes={spending}
              links={links}
              currencyCode={currencyCode}
              formatMoneyShort={formatMoneyShort}
            />
          </View>

          <View style={[styles.summaryRow, { borderTopColor: theme.border }]}>
            <SummaryItem
              label={AppConfig.strings.reports.incomeShort}
              amount={summary.totalIncome}
              currencyCode={currencyCode}
            />
            <SummaryItem
              label={AppConfig.strings.reports.expenseShort}
              amount={summary.totalExpense}
              currencyCode={currencyCode}
            />
            {summary.surplus > 0 ? (
              <SummaryItem
                label={AppConfig.strings.reports.sankeySurplus}
                amount={summary.surplus}
                currencyCode={currencyCode}
                tone="success"
              />
            ) : null}
            {summary.deficit > 0 ? (
              <SummaryItem
                label={AppConfig.strings.reports.sankeyDrawdown}
                amount={summary.deficit}
                currencyCode={currencyCode}
                tone="error"
              />
            ) : null}
          </View>
        </>
      ) : (
        <AppText variant="caption" color="secondary" style={styles.noData}>
          {AppConfig.strings.reports.chartNoData}
        </AppText>
      )}
    </ReportChartCard>
  );
}

function LegendColumn({
  title,
  nodes,
  links,
  currencyCode,
  formatMoneyShort,
}: {
  title: string;
  nodes: SankeyNode[];
  links: SankeyLink[];
  currencyCode: string;
  formatMoneyShort: (amount: number, currencyCode: string) => string;
}) {
  if (nodes.length === 0) return null;

  return (
    <View style={styles.legendColumn}>
      <AppText variant="caption" color="secondary" style={styles.legendTitle}>
        {title}
      </AppText>
      {nodes.map(node => {
        const amount = getSankeyNodeAmount(node.id, links);
        return (
          <View key={node.id} style={styles.legendRow}>
            <AppText variant="caption" weight="semibold" numberOfLines={1}>
              {node.name}
            </AppText>
            <View style={styles.legendAmounts}>
              <AppText variant="caption" color="secondary">
                {formatMoneyShort(amount, currencyCode)}
              </AppText>
              {node.percentOfIncome !== undefined ? (
                <AppText variant="caption" color="secondary">
                  {formatPercentLabel(node.percentOfIncome)}
                </AppText>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function SummaryItem({
  label,
  amount,
  currencyCode,
  tone,
}: {
  label: string;
  amount: number;
  currencyCode: string;
  tone?: 'success' | 'error';
}) {
  return (
    <View style={styles.summaryItem}>
      <AppText variant="caption" color="secondary">
        {label}
      </AppText>
      <MoneyText
        amount={amount}
        currencyCode={currencyCode}
        variant="caption"
        weight="bold"
        color={tone ?? 'text'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  legend: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  legendColumn: {
    flex: 1,
    gap: Spacing.sm,
  },
  legendTitle: {
    marginBottom: 2,
  },
  legendRow: {
    gap: 2,
  },
  legendAmounts: {
    flexDirection: 'row',
    gap: Spacing.xs,
    alignItems: 'center',
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  summaryItem: {
    minWidth: '28%',
    gap: 2,
  },
  noData: {
    textAlign: 'center',
    paddingVertical: Spacing.lg,
  },
});
