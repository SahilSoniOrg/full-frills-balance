import { DonutChart } from '@/src/components/charts/DonutChart';
import { MoneyText } from '@/src/components/common/MoneyText';
import { AppText, ColoredDot } from '@/src/components/core';
import { Spacing } from '@/src/constants';
import { AppConfig } from '@/src/constants/app-config';
import { REPORT_CHART_LAYOUT } from '@/src/constants/report-constants';
import { resolveThemeColor } from '@/src/design-system/utils';
import { ReportLegendRow } from '@/src/features/reports/hooks/reportTabTypes';
import { useTheme } from '@/src/hooks/use-theme';
import { AccountId } from '@/src/types/domain';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface BreakdownDonutCardProps {
  title?: string;
  donutData: { value: number; color: string; label: string }[];
  legendRows: ReportLegendRow[];
  totalCount: number;
  showExpansionButton: boolean;
  expanded: boolean;
  onToggleExpansion: () => void;
  onLegendRowPress: (accountIds: AccountId[]) => void;
  currencyCode: string;
  donutSize?: number;
  donutStrokeWidth?: number;
}

const DEFAULT_DONUT_SIZE = REPORT_CHART_LAYOUT.donutSize;
const DEFAULT_DONUT_STROKE_WIDTH = REPORT_CHART_LAYOUT.donutStrokeWidth;

export function BreakdownDonutCard({
  donutData,
  legendRows,
  totalCount,
  showExpansionButton,
  expanded,
  onToggleExpansion,
  onLegendRowPress,
  currencyCode,
  donutSize = DEFAULT_DONUT_SIZE,
  donutStrokeWidth = DEFAULT_DONUT_STROKE_WIDTH,
}: BreakdownDonutCardProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.donutContainer}>
      <DonutChart data={donutData} size={donutSize} strokeWidth={donutStrokeWidth} />
      <View style={styles.legend}>
        {legendRows.map(row => (
          <TouchableOpacity
            key={row.id}
            style={styles.legendItem}
            onPress={() => onLegendRowPress(row.accountIds)}
            activeOpacity={REPORT_CHART_LAYOUT.donutLegendRowActiveOpacity}
          >
            <ColoredDot color={resolveThemeColor(theme, row.color) || theme.border} />
            <View style={styles.legendNameWrap}>
              <AppText variant="caption" numberOfLines={1}>
                {row.accountName}
              </AppText>
            </View>
            <View style={styles.legendValueWrap}>
              <AppText variant="body" weight="bold">
                {row.percentage}%
              </AppText>
              <MoneyText
                amount={row.amount}
                currencyCode={currencyCode}
                variant="caption"
                color="secondary"
                style={styles.amountText}
              />
            </View>
          </TouchableOpacity>
        ))}
        {showExpansionButton && (
          <TouchableOpacity onPress={onToggleExpansion} style={styles.showMoreButton}>
            <AppText variant="caption" color="primary">
              {expanded
                ? AppConfig.strings.reports.showLess
                : AppConfig.strings.reports.showAll(totalCount)}
            </AppText>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    marginBottom: Spacing.md,
  },
  chartCard: {
    marginBottom: Spacing.xl,
  },
  donutContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  legend: {
    flex: 1,
    marginLeft: Spacing.lg,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  legendNameWrap: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  legendValueWrap: {
    alignItems: 'flex-end',
  },
  amountText: {
    fontSize: REPORT_CHART_LAYOUT.donutLegendRowAmountFontSize,
  },
  showMoreButton: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    marginTop: Spacing.sm,
  },
});
