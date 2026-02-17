import { AppIcon, AppText } from '@/src/components/core';
import { Shape, Spacing } from '@/src/constants';
import { REPORT_CHART_LAYOUT } from '@/src/constants/report-constants';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
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

const TooltipBase = ({ left, top, backgroundColor, borderColor, onViewTransactions, children }: TooltipBaseProps) => (
    <View style={[
        styles.tooltip,
        {
            left,
            top,
            width: REPORT_CHART_LAYOUT.tooltipWidth,
            backgroundColor,
            borderColor,
        }
    ]}>
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
            <AppIcon name="arrowRight" size={REPORT_CHART_LAYOUT.tooltipIconSize} color={backgroundColor === '#000' ? '#fff' : undefined} />
        </TouchableOpacity>
        {children}
    </View>
);

interface NetWorthTooltipProps {
    left: number;
    top: number;
    backgroundColor: string;
    borderColor: string;
    date: number | Date;
    netWorth: number;
    income: number;
    expense: number;
    successColor: string;
    errorColor: string;
    onViewTransactions: () => void;
    incomeLabel: string;
    expenseLabel: string;
}

export const NetWorthTooltip = ({
    left,
    top,
    backgroundColor,
    borderColor,
    date,
    netWorth,
    income,
    expense,
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
        <AppText variant="caption" color="secondary" style={styles.tooltipDate}>
            {formatDate(date)}
        </AppText>

        <AppText variant="body" weight="bold" style={styles.tooltipNetWorth}>
            {CurrencyFormatter.formatWithPreference(netWorth)}
        </AppText>

        <View style={[styles.tooltipRow, { borderTopColor: borderColor }]}>
            <View style={styles.tooltipItem}>
                <AppText variant="caption" color="secondary" style={styles.tooltipLabel}>{incomeLabel}</AppText>
                <AppText variant="caption" style={{ color: successColor }} weight="bold">
                    {CurrencyFormatter.formatShort(income)}
                </AppText>
            </View>
            <View style={styles.tooltipItem}>
                <AppText variant="caption" color="secondary" style={styles.tooltipLabel}>{expenseLabel}</AppText>
                <AppText variant="caption" style={{ color: errorColor }} weight="bold">
                    {CurrencyFormatter.formatShort(expense)}
                </AppText>
            </View>
        </View>
    </TooltipBase>
);

interface IncomeExpenseTooltipProps {
    left: number;
    top: number;
    backgroundColor: string;
    borderColor: string;
    label: string;
    income: number;
    expense: number;
    successColor: string;
    errorColor: string;
    onViewTransactions: () => void;
    incomeLabel: string;
    expenseLabel: string;
}

export const IncomeExpenseTooltip = ({
    left,
    top,
    backgroundColor,
    borderColor,
    label,
    income,
    expense,
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
        <AppText variant="caption" color="secondary" style={styles.tooltipDate}>
            {label}
        </AppText>

        <View style={[styles.tooltipRow, { borderTopWidth: 0, marginTop: Spacing.xs }]}>
            <View style={styles.tooltipItem}>
                <AppText variant="caption" color="secondary" style={styles.tooltipLabel}>{incomeLabel}</AppText>
                <AppText variant="caption" style={{ color: successColor }} weight="bold">
                    {CurrencyFormatter.formatShort(income)}
                </AppText>
            </View>
            <View style={styles.tooltipItem}>
                <AppText variant="caption" color="secondary" style={styles.tooltipLabel}>{expenseLabel}</AppText>
                <AppText variant="caption" style={{ color: errorColor }} weight="bold">
                    {CurrencyFormatter.formatShort(expense)}
                </AppText>
            </View>
        </View>
    </TooltipBase>
);

const styles = StyleSheet.create({
    tooltip: {
        position: 'absolute',
        borderRadius: Shape.radius.md,
        padding: Spacing.sm,
        borderWidth: 1,
        // Shadow/Elevation handled by constants but applied here
        shadowOffset: { width: REPORT_CHART_LAYOUT.tooltipShadowOffsetX, height: REPORT_CHART_LAYOUT.tooltipShadowOffsetY },
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
        width: '100%',
        justifyContent: 'space-around',
        borderTopWidth: StyleSheet.hairlineWidth,
        paddingTop: REPORT_CHART_LAYOUT.tooltipRowPaddingTop,
        marginBottom: REPORT_CHART_LAYOUT.tooltipRowMarginBottom,
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
});
