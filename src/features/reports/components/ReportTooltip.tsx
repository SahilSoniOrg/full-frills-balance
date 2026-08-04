import { AppIcon, AppText } from '@/src/components/core';
import { AppConfig, Shape, Spacing } from '@/src/constants';
import { REPORT_CHART_LAYOUT } from '@/src/constants/report-constants';
import { resolveThemeColor } from '@/src/design-system/utils';
import { useTheme } from '@/src/hooks/use-theme';
import { formatDate } from '@/src/utils/dateUtils';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface TooltipBaseProps {
  left: number;
  top: number;
  backgroundColor: string;
  borderColor: string;
  onViewTransactions: () => void;
  children: React.ReactNode;
}

const TooltipBase = ({
  left,
  top,
  backgroundColor,
  borderColor,
  onViewTransactions,
  children,
}: TooltipBaseProps) => {
  const { theme, onContrast } = useTheme();
  const resolvedBg = resolveThemeColor(theme, backgroundColor) as string;
  const resolvedBorder = resolveThemeColor(theme, borderColor) as string;

  return (
    <View
      style={[
        styles.tooltip,
        {
          left,
          top,
          width: REPORT_CHART_LAYOUT.tooltipWidth,
          backgroundColor: resolvedBg,
          borderColor: resolvedBorder,
        },
      ]}
    >
      <TouchableOpacity
        style={styles.tooltipIconButton}
        onPress={onViewTransactions}
        hitSlop={{
          top: REPORT_CHART_LAYOUT.tooltipHitSlop,
          bottom: REPORT_CHART_LAYOUT.tooltipHitSlop,
          left: REPORT_CHART_LAYOUT.tooltipHitSlop,
          right: REPORT_CHART_LAYOUT.tooltipHitSlop,
        }}
      >
        <AppIcon
          name="arrowRight"
          size={REPORT_CHART_LAYOUT.tooltipIconSize}
          color={onContrast(resolvedBg)}
        />
      </TouchableOpacity>
      {children}
    </View>
  );
};

interface NetWorthTooltipProps {
  left: number;
  top: number;
  backgroundColor: string;
  borderColor: string;
  date: number | Date;
  netWorthText: string;
  incomeText: string;
  expenseText: string;
  successColor: string;
  errorColor: string;
  onViewTransactions: () => void;
  incomeLabel: string;
  expenseLabel: string;
}

interface NetWorthTooltipContentProps {
  date: number | Date;
  netWorthText: string;
  incomeText: string;
  expenseText: string;
  successColor: string;
  errorColor: string;
  borderColor: string;
  incomeLabel: string;
  expenseLabel: string;
  onViewTransactions: () => void;
  backgroundColor: string;
}

export const NetWorthTooltip = ({
  left,
  top,
  backgroundColor,
  borderColor,
  date,
  netWorthText,
  incomeText,
  expenseText,
  successColor,
  errorColor,
  onViewTransactions,
  incomeLabel,
  expenseLabel,
}: NetWorthTooltipProps) => (
  <TooltipBase
    left={left}
    top={top}
    backgroundColor={backgroundColor}
    borderColor={borderColor}
    onViewTransactions={onViewTransactions}
  >
    <NetWorthTooltipContent
      date={date}
      netWorthText={netWorthText}
      incomeText={incomeText}
      expenseText={expenseText}
      successColor={successColor}
      errorColor={errorColor}
      borderColor={borderColor}
      incomeLabel={incomeLabel}
      expenseLabel={expenseLabel}
      onViewTransactions={onViewTransactions}
      backgroundColor={backgroundColor}
    />
  </TooltipBase>
);

export const NetWorthTooltipContent = ({
  date,
  netWorthText,
  incomeText,
  expenseText,
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

      <AppText variant="body" weight="bold" style={styles.tooltipNetWorth}>
        {netWorthText}
      </AppText>

      <View style={[styles.tooltipRow, { borderTopColor: borderColor }]}>
        <View style={styles.tooltipItem}>
          <AppText variant="caption" color="secondary" style={styles.tooltipLabel}>
            {incomeLabel}
          </AppText>
          <AppText variant="caption" style={{ color: successColor }} weight="bold">
            {incomeText}
          </AppText>
        </View>
        <View style={styles.tooltipItem}>
          <AppText variant="caption" color="secondary" style={styles.tooltipLabel}>
            {expenseLabel}
          </AppText>
          <AppText variant="caption" style={{ color: errorColor }} weight="bold">
            {expenseText}
          </AppText>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.detailsButton, { backgroundColor: contrastColor + '10' }]}
        onPress={onViewTransactions}
      >
        <AppText variant="caption" weight="bold" style={{ color: contrastColor }}>
          {AppConfig.strings.reports.viewDetails}
        </AppText>
        <AppIcon name="arrowRight" size={10} color={contrastColor} style={{ marginLeft: 4 }} />
      </TouchableOpacity>
    </View>
  );
};

interface IncomeExpenseTooltipProps {
  left: number;
  top: number;
  backgroundColor: string;
  borderColor: string;
  label: string;
  incomeText: string;
  expenseText: string;
  successColor: string;
  errorColor: string;
  onViewTransactions: () => void;
  incomeLabel: string;
  expenseLabel: string;
}

interface IncomeExpenseTooltipContentProps {
  label: string;
  incomeText: string;
  expenseText: string;
  successColor: string;
  errorColor: string;
  incomeLabel: string;
  expenseLabel: string;
  onViewTransactions: () => void;
  backgroundColor: string;
}

export const IncomeExpenseTooltip = ({
  left,
  top,
  backgroundColor,
  borderColor,
  label,
  incomeText,
  expenseText,
  successColor,
  errorColor,
  onViewTransactions,
  incomeLabel,
  expenseLabel,
}: IncomeExpenseTooltipProps) => (
  <TooltipBase
    left={left}
    top={top}
    backgroundColor={backgroundColor}
    borderColor={borderColor}
    onViewTransactions={onViewTransactions}
  >
    <IncomeExpenseTooltipContent
      label={label}
      incomeText={incomeText}
      expenseText={expenseText}
      successColor={successColor}
      errorColor={errorColor}
      incomeLabel={incomeLabel}
      expenseLabel={expenseLabel}
      onViewTransactions={onViewTransactions}
      backgroundColor={backgroundColor}
    />
  </TooltipBase>
);

export const IncomeExpenseTooltipContent = ({
  label,
  incomeText,
  expenseText,
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
          <AppText variant="caption" style={{ color: successColor }} weight="bold">
            {incomeText}
          </AppText>
        </View>
        <View style={styles.tooltipItem}>
          <AppText variant="caption" color="secondary" style={styles.tooltipLabel}>
            {expenseLabel}
          </AppText>
          <AppText variant="caption" style={{ color: errorColor }} weight="bold">
            {expenseText}
          </AppText>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.detailsButton, { backgroundColor: contrastColor + '10' }]}
        onPress={onViewTransactions}
      >
        <AppText variant="caption" weight="bold" style={{ color: contrastColor }}>
          {AppConfig.strings.reports.viewDetails}
        </AppText>
        <AppIcon name="arrowRight" size={10} color={contrastColor} style={{ marginLeft: 4 }} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  tooltip: {
    position: 'absolute',
    borderRadius: Shape.radius.md,
    padding: Spacing.sm,
    borderWidth: 1,
    // Shadow/Elevation handled by constants but applied here
    shadowOffset: {
      width: REPORT_CHART_LAYOUT.tooltipShadowOffsetX,
      height: REPORT_CHART_LAYOUT.tooltipShadowOffsetY,
    },
    shadowOpacity: REPORT_CHART_LAYOUT.tooltipShadowOpacity,
    shadowRadius: REPORT_CHART_LAYOUT.tooltipShadowRadius,
    elevation: REPORT_CHART_LAYOUT.tooltipElevation,
    zIndex: REPORT_CHART_LAYOUT.tooltipZIndex,
    alignItems: 'center',
  },
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
  tooltipIconButton: {
    position: 'absolute',
    top: REPORT_CHART_LAYOUT.tooltipIconButtonTop,
    right: REPORT_CHART_LAYOUT.tooltipIconButtonRight,
    padding: REPORT_CHART_LAYOUT.tooltipIconButtonPadding,
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
