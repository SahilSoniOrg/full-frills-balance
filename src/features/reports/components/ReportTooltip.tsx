import { Icon, AppIcon, AppText } from '@/src/components/core';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { AppConfig, Shape, Spacing } from '@/src/constants';
import { REPORT_CHART_LAYOUT } from '@/src/constants/report-constants';
import { useTheme } from '@/src/hooks/use-theme';
import { formatDate } from '@/src/utils/dateUtils';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface NetWorthTooltipContentProps {
  date: number | Date;
  netWorth: number;
  income: number;
  expense: number;
  currencyCode: string;
  successColor: string;
  errorColor: string;
  borderColor: string;
  incomeLabel: string;
  expenseLabel: string;
  onViewTransactions: () => void;
  backgroundColor: string;
}

export const NetWorthTooltipContent = ({
  date,
  netWorth,
  income,
  expense,
  currencyCode,
  successColor,
  errorColor,
  borderColor,
  incomeLabel,
  expenseLabel,
  onViewTransactions,
  backgroundColor,
}: NetWorthTooltipContentProps) => {
  const { onContrast } = useTheme();

  const contrastColor = onContrast(backgroundColor);

  return (
    <View style={styles.contentContainer}>
      <AppText variant="caption" color="secondary" style={styles.tooltipDate}>
        {formatDate(date)}
      </AppText>

      <MoneyText
        amount={netWorth}
        currencyCode={currencyCode}
        variant="body"
        weight="bold"
        style={styles.tooltipNetWorth}
      />

      <View style={[styles.tooltipRow, { borderTopColor: borderColor }]}>
        <View style={styles.tooltipItem}>
          <AppText variant="caption" color="secondary" style={styles.tooltipLabel}>
            {incomeLabel}
          </AppText>
          <MoneyText
            amount={income}
            currencyCode={currencyCode}
            formatStyle="short"
            variant="caption"
            weight="bold"
            style={{ color: successColor }}
          />
        </View>
        <View style={styles.tooltipItem}>
          <AppText variant="caption" color="secondary" style={styles.tooltipLabel}>
            {expenseLabel}
          </AppText>
          <MoneyText
            amount={expense}
            currencyCode={currencyCode}
            formatStyle="short"
            variant="caption"
            weight="bold"
            style={{ color: errorColor }}
          />
        </View>
      </View>

      <TouchableOpacity
        style={[styles.detailsButton, { backgroundColor: contrastColor + '10' }]}
        onPress={onViewTransactions}
      >
        <AppText variant="caption" weight="bold" style={{ color: contrastColor }}>
          {AppConfig.strings.reports.viewDetails}
        </AppText>
        <AppIcon name={Icon.ArrowRight} size={10} color={contrastColor} style={{ marginLeft: 4 }} />
      </TouchableOpacity>
    </View>
  );
};

interface IncomeExpenseTooltipContentProps {
  label: string;
  income: number;
  expense: number;
  currencyCode: string;
  successColor: string;
  errorColor: string;
  incomeLabel: string;
  expenseLabel: string;
  onViewTransactions: () => void;
  backgroundColor: string;
}

export const IncomeExpenseTooltipContent = ({
  label,
  income,
  expense,
  currencyCode,
  successColor,
  errorColor,
  incomeLabel,
  expenseLabel,
  onViewTransactions,
  backgroundColor,
}: IncomeExpenseTooltipContentProps) => {
  const { onContrast } = useTheme();

  const contrastColor = onContrast(backgroundColor);

  return (
    <View style={styles.contentContainer}>
      <AppText variant="caption" color="secondary" style={styles.tooltipDate}>
        {label}
      </AppText>

      <View style={[styles.tooltipRow, { borderTopWidth: 0, marginTop: Spacing.xs }]}>
        <View style={styles.tooltipItem}>
          <AppText variant="caption" color="secondary" style={styles.tooltipLabel}>
            {incomeLabel}
          </AppText>
          <MoneyText
            amount={income}
            currencyCode={currencyCode}
            formatStyle="short"
            variant="caption"
            weight="bold"
            style={{ color: successColor }}
          />
        </View>
        <View style={styles.tooltipItem}>
          <AppText variant="caption" color="secondary" style={styles.tooltipLabel}>
            {expenseLabel}
          </AppText>
          <MoneyText
            amount={expense}
            currencyCode={currencyCode}
            formatStyle="short"
            variant="caption"
            weight="bold"
            style={{ color: errorColor }}
          />
        </View>
      </View>

      <TouchableOpacity
        style={[styles.detailsButton, { backgroundColor: contrastColor + '10' }]}
        onPress={onViewTransactions}
      >
        <AppText variant="caption" weight="bold" style={{ color: contrastColor }}>
          {AppConfig.strings.reports.viewDetails}
        </AppText>
        <AppIcon name={Icon.ArrowRight} size={10} color={contrastColor} style={{ marginLeft: 4 }} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  tooltipDate: {
    marginBottom: REPORT_CHART_LAYOUT.tooltipDateMarginBottom,
    fontSize: REPORT_CHART_LAYOUT.tooltipDateFontSize,
  },
  tooltipNetWorth: {
    marginBottom: Spacing.xs,
  },
  tooltipRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: REPORT_CHART_LAYOUT.tooltipRowPaddingTop,
    marginBottom: REPORT_CHART_LAYOUT.tooltipRowMarginBottom,
    gap: Spacing.md,
  },
  tooltipItem: {
    alignItems: 'center',
  },
  tooltipLabel: {
    fontSize: REPORT_CHART_LAYOUT.tooltipLabelFontSize,
    marginBottom: REPORT_CHART_LAYOUT.tooltipLabelMarginBottom,
  },
  detailsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: Spacing.md,
    borderRadius: Shape.radius.sm,
  },
  contentContainer: {
    alignItems: 'center',
  },
});
