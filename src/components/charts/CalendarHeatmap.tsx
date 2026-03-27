import { AppText } from '@/src/components/core';
import { Spacing } from '@/src/constants';
import { REPORT_CHART_LAYOUT } from '@/src/constants/report-constants';
import { useTheme } from '@/src/hooks/use-theme';
import { HeatmapPoint } from '@/src/services/report-service';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import dayjs from 'dayjs';
import React, { useMemo, useState } from 'react';
import { Dimensions, StyleSheet, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import Svg, { G, Rect, Text as SvgText } from 'react-native-svg';

interface CalendarHeatmapProps {
    data: HeatmapPoint[];
    height?: number;
    width?: number;
    title?: string;
    currency: string;
    onCellPress?: (point: HeatmapPoint) => void;
}

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export const CalendarHeatmap: React.FC<CalendarHeatmapProps> = ({
    data,
    height = REPORT_CHART_LAYOUT.calendarDefaultHeight,
    width: customWidth,
    title = "Activity",
    currency,
    onCellPress
}) => {
    const { theme } = useTheme();
    const [selectedPoint, setSelectedPoint] = useState<HeatmapPoint | null>(null);

    const windowWidth = Dimensions.get('window').width;
    const CHART_WIDTH = customWidth || (windowWidth - Spacing.lg * 2);

    const PADDING_LEFT = REPORT_CHART_LAYOUT.calendarPaddingLeft; // Increased for month labels
    const PADDING_TOP = REPORT_CHART_LAYOUT.calendarPaddingTop;
    const PADDING_BOTTOM = REPORT_CHART_LAYOUT.calendarPaddingBottom;
    const CELL_SPACING = REPORT_CHART_LAYOUT.calendarCellSpacing;
    const DAY_LABEL_HEIGHT = REPORT_CHART_LAYOUT.calendarDayLabelHeight;
    const CELL_HEIGHT = REPORT_CHART_LAYOUT.calendarCellHeight;

    const numWeeks = useMemo(() => {
        if (data.length === 0) return 1;
        return Math.max(...data.map(p => p.y)) + 1;
    }, [data]);

    const PLOT_WIDTH = CHART_WIDTH - PADDING_LEFT;
    const calculatedHeight = PADDING_TOP + PADDING_BOTTOM + numWeeks * (CELL_HEIGHT + CELL_SPACING);

    // We want the SVG to at least fill the provided height or the calculated height
    const totalHeight = Math.max(height, calculatedHeight);

    const cellWidth = (PLOT_WIDTH - (6 * CELL_SPACING)) / 7;

    const maxValue = useMemo(() => Math.max(...data.map(p => p.value), 1), [data]);

    const getOpacity = (value: number) => {
        if (value === 0) return 0.04;
        return 0.15 + (Math.sqrt(value) / Math.sqrt(maxValue)) * 0.85;
    };

    return (
        <View style={{ height: totalHeight, width: CHART_WIDTH, overflow: 'visible' }}>
            <TouchableWithoutFeedback onPress={() => setSelectedPoint(null)}>
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
            </TouchableWithoutFeedback>

            <View style={{ marginBottom: Spacing.sm }}>
                <AppText variant="caption" style={{ color: theme.textSecondary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>
                    {title}
                </AppText>
            </View>
            <Svg height={totalHeight} width={CHART_WIDTH} style={{ overflow: 'visible' }}>
                {/* Day Labels (X-Axis) */}
                {DAYS.map((d, i) => (
                    <SvgText
                        key={i}
                        x={PADDING_LEFT + i * (cellWidth + CELL_SPACING) + (cellWidth / 2)}
                        y={DAY_LABEL_HEIGHT}
                        fontSize={10}
                        fontWeight="800"
                        fill={theme.textSecondary}
                        textAnchor="middle"
                    >
                        {d}
                    </SvgText>
                ))}

                {/* Weeks and Months */}
                {data.map((p, i) => {
                    const x = PADDING_LEFT + p.x * (cellWidth + CELL_SPACING);
                    const y = PADDING_TOP + (p.y * (CELL_HEIGHT + CELL_SPACING));
                    const isSelected = selectedPoint?.x === p.x && selectedPoint?.y === p.y;

                    return (
                        <G key={i}>
                            {/* Month Label on the left of the start of a month */}
                            {p.monthLabel && (
                                <SvgText
                                    x={PADDING_LEFT - 8}
                                    y={y + CELL_HEIGHT / 2 + 4}
                                    fontSize={10}
                                    fontWeight="800"
                                    fill={theme.text}
                                    textAnchor="end"
                                >
                                    {p.monthLabel}
                                </SvgText>
                            )}

                            <Rect
                                x={x}
                                y={y}
                                width={cellWidth}
                                height={CELL_HEIGHT}
                                rx={4}
                                fill={isSelected ? theme.text : theme.primary}
                                opacity={isSelected ? 1 : getOpacity(p.value)}
                                onPress={() => setSelectedPoint(p)}
                            />
                            {p.label && (
                                <SvgText
                                    x={x + cellWidth / 2}
                                    y={y + CELL_HEIGHT / 2 + 3}
                                    fontSize={8}
                                    fontWeight="600"
                                    fill={isSelected ? theme.surface : theme.text}
                                    textAnchor="middle"
                                    opacity={p.value === 0 ? 0.25 : 0.7}
                                    pointerEvents="none"
                                >
                                    {p.label}
                                </SvgText>
                            )}
                        </G>
                    );
                })}

                {/* Legend - Positioned at the very bottom */}
                <SvgText x={CHART_WIDTH - 65} y={totalHeight - 25} fontSize={9} fill={theme.textSecondary} textAnchor="end">Low</SvgText>
                {[0.2, 0.4, 0.6, 0.8, 1.0].map((level, i) => (
                    <Rect
                        key={i}
                        x={CHART_WIDTH - 60 + (i * 10)}
                        y={totalHeight - 33}
                        width={8}
                        height={8}
                        rx={1.5}
                        fill={theme.primary}
                        opacity={0.15 + level * 0.85}
                    />
                ))}
                <SvgText x={CHART_WIDTH} y={totalHeight - 25} fontSize={9} fill={theme.textSecondary} textAnchor="start">High</SvgText>
            </Svg>

            {selectedPoint && (() => {
                const isTopRow = selectedPoint.y < 2;
                const tooltipY = PADDING_TOP + (selectedPoint.y * (CELL_HEIGHT + CELL_SPACING));
                return (
                    <View
                        style={[
                            styles.tooltip,
                            {
                                backgroundColor: theme.surface,
                                borderColor: theme.border,
                                top: isTopRow ? tooltipY + CELL_HEIGHT + 8 : tooltipY - 65,
                                left: Math.max(Spacing.sm, Math.min(CHART_WIDTH - 150, PADDING_LEFT + selectedPoint.x * (cellWidth + CELL_SPACING) - 60)),
                            }
                        ]}
                    >
                        <View style={styles.tooltipHeader}>
                            <AppText variant="caption" style={{ fontWeight: '700', color: theme.textSecondary }}>
                                {selectedPoint.timestamp ? dayjs(selectedPoint.timestamp).format('MMM D, YYYY') : `Day ${selectedPoint.label}`}
                            </AppText>

                            {onCellPress && (
                                <TouchableOpacity
                                    style={[styles.viewButton, { backgroundColor: theme.primaryLight }]}
                                    onPress={() => {
                                        onCellPress(selectedPoint);
                                        setSelectedPoint(null);
                                    }}
                                >
                                    <AppText variant="caption" style={{ color: theme.primary, fontWeight: '800', fontSize: 10 }}>VIEW</AppText>
                                </TouchableOpacity>
                            )}
                        </View>

                        <AppText variant="body" style={{ fontWeight: '800', color: theme.text, marginTop: 2 }}>
                            {CurrencyFormatter.formatAmount(selectedPoint.value, currency)}
                        </AppText>
                    </View>
                );
            })()}
        </View>
    );
};

const styles = StyleSheet.create({
    tooltip: {
        position: 'absolute',
        padding: Spacing.sm,
        borderRadius: 12,
        borderWidth: 1,
        width: 140,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
        elevation: 8,
        zIndex: 100,
    },
    tooltipHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    viewButton: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
    }
});
