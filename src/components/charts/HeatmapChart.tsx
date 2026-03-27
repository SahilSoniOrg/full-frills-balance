import { AppText } from '@/src/components/core';
import { Spacing } from '@/src/constants';
import { REPORT_CHART_LAYOUT } from '@/src/constants/report-constants';
import { useTheme } from '@/src/hooks/use-theme';
import { HeatmapPoint } from '@/src/services/report-service';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import React, { useMemo, useState } from 'react';
import { Dimensions, StyleSheet, TouchableWithoutFeedback, View } from 'react-native';
import Svg, { G, Rect, Text as SvgText } from 'react-native-svg';

interface HeatmapChartProps {
    data: HeatmapPoint[];
    height?: number;
    width?: number;
    currency: string;
}

export const HeatmapChart: React.FC<HeatmapChartProps> = ({
    data,
    height = REPORT_CHART_LAYOUT.heatmapDefaultHeight,
    width: customWidth,
    currency
}) => {
    const { theme } = useTheme();
    const [selectedPoint, setSelectedPoint] = useState<HeatmapPoint | null>(null);
    const windowWidth = Dimensions.get('window').width;
    const CHART_WIDTH = customWidth || (windowWidth - Spacing.lg * 2);

    const HOURS_DETAILED = ['12a', '2a', '4a', '6a', '8a', '10a', '12p', '2p', '4p', '6p', '8p', '10p'];
    const DAYS_SHORT = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

    const PADDING_LEFT = REPORT_CHART_LAYOUT.heatmapPaddingLeft;
    const PADDING_TOP = REPORT_CHART_LAYOUT.heatmapPaddingTop;
    const PADDING_BOTTOM = REPORT_CHART_LAYOUT.heatmapPaddingBottom; // Increased for legend
    const CELL_SPACING = REPORT_CHART_LAYOUT.heatmapCellSpacing;

    const PLOT_WIDTH = CHART_WIDTH - PADDING_LEFT - 10;
    const PLOT_HEIGHT = height - PADDING_TOP - PADDING_BOTTOM;

    const cellWidth = PLOT_WIDTH / 7;
    const cellHeight = PLOT_HEIGHT / 24;

    const maxValue = useMemo(() => Math.max(...data.map(p => p.value), 1), [data]);

    const getOpacity = (value: number) => {
        if (value === 0) return 0.03;
        return 0.12 + (Math.sqrt(value) / Math.sqrt(maxValue)) * 0.88;
    };

    return (
        <View style={{ height, width: CHART_WIDTH, overflow: 'visible' }}>
            <TouchableWithoutFeedback onPress={() => setSelectedPoint(null)}>
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
            </TouchableWithoutFeedback>

            <Svg height={height} width={CHART_WIDTH} style={{ overflow: 'visible' }}>
                {/* Y-Axis Labels (Hours) */}
                {HOURS_DETAILED.map((h, i) => {
                    const hour = i * 2;
                    const y = PADDING_TOP + (hour * cellHeight) + (cellHeight / 2);
                    return (
                        <SvgText
                            key={h}
                            x={PADDING_LEFT - 8}
                            y={y + 3}
                            fontSize={8}
                            fontWeight="600"
                            fill={theme.textSecondary}
                            textAnchor="end"
                        >
                            {h}
                        </SvgText>
                    );
                })}

                {/* X-Axis Labels (Days) */}
                {DAYS_SHORT.map((d, i) => {
                    const x = PADDING_LEFT + (i * cellWidth) + (cellWidth / 2);
                    return (
                        <SvgText
                            key={i}
                            x={x}
                            y={height - 32}
                            fontSize={10}
                            fontWeight="700"
                            fill={theme.textSecondary}
                            textAnchor="middle"
                        >
                            {d}
                        </SvgText>
                    );
                })}

                {/* Heatmap Cells */}
                {data.map((p, i) => {
                    const x = PADDING_LEFT + (p.x * cellWidth);
                    const y = PADDING_TOP + (p.y * cellHeight);
                    const isSelected = selectedPoint?.x === p.x && selectedPoint?.y === p.y;

                    return (
                        <G key={i}>
                            <Rect
                                x={x + CELL_SPACING}
                                y={y + CELL_SPACING}
                                width={cellWidth - CELL_SPACING * 2}
                                height={cellHeight - CELL_SPACING * 2}
                                rx={1.5}
                                fill={isSelected ? theme.text : theme.primary}
                                opacity={isSelected ? 1 : getOpacity(p.value)}
                                onPress={() => setSelectedPoint(p)}
                            />
                        </G>
                    );
                })}

                {/* Legend - Centered at bottom */}
                <SvgText x={PADDING_LEFT} y={height - 10} fontSize={8} fill={theme.textSecondary} textAnchor="start">Less Activity</SvgText>
                {[0.2, 0.4, 0.6, 0.8, 1.0].map((level, i) => (
                    <Rect
                        key={i}
                        x={CHART_WIDTH / 2 - 20 + (i * 10)}
                        y={height - 16}
                        width={8}
                        height={8}
                        rx={1.5}
                        fill={theme.primary}
                        opacity={0.12 + level * 0.88}
                    />
                ))}
                <SvgText x={CHART_WIDTH - 10} y={height - 10} fontSize={8} fill={theme.textSecondary} textAnchor="end">More</SvgText>
            </Svg>

            {selectedPoint && (() => {
                const isTopHalf = selectedPoint.y < 8; // Top 8 hours (0-7)
                const tooltipY = PADDING_TOP + (selectedPoint.y * cellHeight);

                return (
                    <View
                        style={[
                            styles.tooltip,
                            {
                                backgroundColor: theme.surface,
                                borderColor: theme.border,
                                top: isTopHalf ? tooltipY + cellHeight + 8 : tooltipY - 55,
                                left: Math.max(Spacing.sm, Math.min(CHART_WIDTH - 125, PADDING_LEFT + selectedPoint.x * cellWidth - 45)),
                            }
                        ]}
                    >
                        <View style={styles.tooltipHeader}>
                            <AppText variant="caption" style={{ fontWeight: '700', color: theme.textSecondary }}>
                                {DAYS_SHORT[selectedPoint.x]} • {selectedPoint.y}:00
                            </AppText>
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
        width: 120,
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
        marginBottom: 2,
    }
});
