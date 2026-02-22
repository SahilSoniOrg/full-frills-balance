
import { AppText } from '@/src/components/core';
import { Layout, Spacing } from '@/src/constants';
import { REPORT_CHART_LAYOUT, REPORT_CHART_STRINGS } from '@/src/constants/report-constants';
import { useTheme } from '@/src/hooks/use-theme';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { triggerHaptic } from '@/src/utils/haptics';
import React, { useMemo, useRef } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';

interface DataPoint {
    x: number; // timestamp
    y: number; // value
}

interface LineChartProps {
    data: DataPoint[];
    height?: number;
    color?: string;
    showGradient?: boolean;
    width?: number;
    onPress?: (index: number) => void;
    selectedIndex?: number;
    domainX?: [number, number]; // [min, max] bound for the time range
    renderTooltip?: (params: { index: number; x: number; y: number; dataPoint: DataPoint }) => React.ReactNode;
}

export const LineChart = ({
    data,
    height = Layout.chart.line.defaultHeight,
    color,
    showGradient = true,
    width: customWidth,
    onPress,
    selectedIndex,
    domainX,
    renderTooltip
}: LineChartProps) => {
    const { theme } = useTheme();
    const chartColor = color || theme.primary;
    const { width: windowWidth } = Dimensions.get('window');
    const CHART_WIDTH = customWidth || (windowWidth - (Spacing.lg * 2)); // Padding
    const PADDING_VERTICAL = Spacing.lg;
    const PADDING_LEFT = Spacing.xl * 2; // More space for scale (approx 40px)
    const PADDING_RIGHT = Spacing.lg; // Prevent right-side clipping
    const PLOT_WIDTH = Math.max(0, CHART_WIDTH - PADDING_LEFT - PADDING_RIGHT);

    const { path, gradientPath, minX, maxX, displayMinY, displayRange, maxValPoint } = useMemo(() => {
        if (data.length === 0) return { path: "", gradientPath: "", minX: 0, maxX: 0, displayMinY: 0, displayRange: 0, maxValPoint: undefined };

        const yValues = data.map(d => d.y);
        const xValues = data.map(d => d.x);

        const minX = domainX ? domainX[0] : Math.min(...xValues);
        const maxX = domainX ? domainX[1] : Math.max(...xValues);
        const minY = Math.min(...yValues);
        const maxY = Math.max(...yValues);

        // Add some padding to Y range
        const yRange = maxY - minY || 1;
        const displayMinY = minY - (yRange * 0.1);
        const displayMaxY = maxY + (yRange * 0.1);
        const displayRange = displayMaxY - displayMinY;
        const xRange = maxX - minX;

        // Determine max value point for annotation
        const maxValIndex = yValues.indexOf(maxY);
        const maxValPoint = data[maxValIndex];

        let pathStr = "";
        let gradientPathStr = "";

        data.forEach((point, index) => {
            const normalizedX = xRange === 0 ? 0.5 : (point.x - minX) / xRange;
            const x = PADDING_LEFT + (normalizedX * PLOT_WIDTH);
            // Invert Y because SVG 0 is top
            const y = height - PADDING_VERTICAL - (((point.y - displayMinY) / displayRange) * (height - (PADDING_VERTICAL * 2)));

            if (index === 0) {
                pathStr += `M ${x} ${y}`;
                gradientPathStr += `M ${x} ${height - PADDING_VERTICAL} L ${x} ${y}`;
            } else {
                pathStr += ` L ${x} ${y}`;
                gradientPathStr += ` L ${x} ${y}`;
            }
        });

        // Close gradient path
        if (data.length > 0) {
            const lastPoint = data[data.length - 1];
            const normalizedLastX = xRange === 0 ? 0.5 : (lastPoint.x - minX) / xRange;
            const lastX = PADDING_LEFT + (normalizedLastX * PLOT_WIDTH);
            gradientPathStr += ` L ${lastX} ${height - PADDING_VERTICAL} L ${PADDING_LEFT} ${height - PADDING_VERTICAL} Z`;
        }

        return { path: pathStr, gradientPath: gradientPathStr, minX, maxX, displayMinY, displayRange, maxValPoint };
    }, [data, height, CHART_WIDTH, PLOT_WIDTH, PADDING_VERTICAL, PADDING_LEFT, domainX]);

    const lastGestureIndex = useRef(-1);

    const handleGesture = (x: number, isStart: boolean) => {
        if (data.length === 0) return;
        if (!onPress) return;

        // Calculate index from x
        const contentWidth = PLOT_WIDTH;
        const relativeX = x - PADDING_LEFT;

        // Clamp
        let index = -1;
        if (data.length === 1) {
            index = 0;
        } else if (relativeX < 0) {
            index = 0;
        } else if (relativeX > contentWidth) {
            index = data.length - 1;
        } else {
            const step = contentWidth / (data.length - 1);
            index = Math.round(relativeX / step);
        }

        if (index >= 0 && index < data.length) {
            if (isStart) {
                // New gesture - always report (allows toggle)
                lastGestureIndex.current = index;
                triggerHaptic('light');
                onPress(index);
            } else {
                // Continuation - only report change
                if (index !== lastGestureIndex.current) {
                    lastGestureIndex.current = index;
                    triggerHaptic('light');
                    onPress(index);
                }
            }
        }
    };

    const pan = Gesture.Pan()
        //.activeOffsetX([-10, 10]) // Removed to allow immediate touch recognition
        .onBegin((e) => {
            runOnJS(handleGesture)(e.x, true);
        })
        .onUpdate((e) => {
            runOnJS(handleGesture)(e.x, false);
        });

    const selectedPointInfo = useMemo(() => {
        if (selectedIndex === undefined || selectedIndex === -1 || !data[selectedIndex] || data.length === 0) return null;
        const xRange = maxX - minX;

        const point = data[selectedIndex];
        const normalizedX = xRange === 0 ? 0.5 : (point.x - minX) / xRange;
        const x = PADDING_LEFT + (normalizedX * PLOT_WIDTH);
        const y = height - PADDING_VERTICAL - (((point.y - displayMinY) / displayRange) * (height - (PADDING_VERTICAL * 2)));

        return { x, y, point };
    }, [selectedIndex, data, minX, maxX, displayMinY, displayRange, height, CHART_WIDTH, PLOT_WIDTH, PADDING_LEFT, PADDING_VERTICAL]);

    if (data.length === 0) {
        return (
            <View style={[styles.container, { height, borderColor: theme.border, borderWidth: 1, justifyContent: 'center', alignItems: 'center' }]}>
                <AppText color="secondary">{REPORT_CHART_STRINGS.chartNoData}</AppText>
            </View>
        );
    }

    return (
        <View style={{ height, width: CHART_WIDTH }}>
            <View style={{ width: CHART_WIDTH, height }}>
                <GestureHandlerRootView style={{ flex: 1 }}>
                    <GestureDetector gesture={pan}>
                        <View style={{ width: CHART_WIDTH, height }}>
                            <Svg height={height} width={CHART_WIDTH}>
                                <Defs>
                                    <LinearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
                                        <Stop offset="0" stopColor={chartColor} stopOpacity="0.5" />
                                        <Stop offset="1" stopColor={chartColor} stopOpacity="0" />
                                    </LinearGradient>
                                </Defs>

                                {/* Grid Lines & Ticks */}
                                {REPORT_CHART_LAYOUT.lineChartTicks.map((t) => {
                                    const val = displayMinY + (t * displayRange);
                                    const y = height - PADDING_VERTICAL - (t * (height - PADDING_VERTICAL * 2));
                                    return (
                                        <React.Fragment key={t}>
                                            <Line
                                                x1={PADDING_LEFT}
                                                y1={y}
                                                x2={CHART_WIDTH - PADDING_RIGHT}
                                                y2={y}
                                                stroke={theme.border}
                                                strokeWidth={1}
                                                strokeDasharray="4,4"
                                                opacity={REPORT_CHART_LAYOUT.lineChartGridOpacity}
                                            />
                                            <SvgText
                                                x={PADDING_LEFT - REPORT_CHART_LAYOUT.lineChartYLabelOffsetX}
                                                y={y + REPORT_CHART_LAYOUT.lineChartYLabelOffsetY}
                                                fontSize={REPORT_CHART_LAYOUT.lineChartYLabelFontSize}
                                                fill={theme.textSecondary}
                                                textAnchor="end"
                                            >
                                                {CurrencyFormatter.formatShort(val)}
                                            </SvgText>
                                        </React.Fragment>
                                    );
                                })}

                                {/* Max Value Annotation */}
                                {maxValPoint && (() => {
                                    const normalizedX = maxX === minX ? 0.5 : (maxValPoint.x - minX) / (maxX - minX);
                                    const x = PADDING_LEFT + (normalizedX * PLOT_WIDTH);
                                    const y = height - PADDING_VERTICAL - (((maxValPoint.y - displayMinY) / displayRange) * (height - (PADDING_VERTICAL * 2)));
                                    return (
                                        <React.Fragment>
                                            <Circle cx={x} cy={y} r={REPORT_CHART_LAYOUT.lineChartMaxPointRadius} fill={chartColor} opacity={0.8} />
                                            <SvgText
                                                x={x}
                                                y={y - REPORT_CHART_LAYOUT.lineChartMaxLabelOffsetY}
                                                fontSize={REPORT_CHART_LAYOUT.lineChartMaxLabelFontSize}
                                                fontWeight="bold"
                                                fill={chartColor}
                                                textAnchor="middle"
                                            >
                                                {REPORT_CHART_STRINGS.maxLabel}
                                            </SvgText>
                                        </React.Fragment>
                                    );
                                })()}

                                {showGradient && (
                                    <Path
                                        d={gradientPath}
                                        fill="url(#gradient)"
                                    />
                                )}
                                <Path
                                    d={path}
                                    stroke={chartColor}
                                    strokeWidth={REPORT_CHART_LAYOUT.lineChartSeriesStrokeWidth}
                                    fill="none"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    opacity={selectedIndex !== undefined && selectedIndex !== -1 ? REPORT_CHART_LAYOUT.lineChartSelectedSeriesOpacity : 1}
                                />

                                {/* Interactive Points */}
                                {data.map((point, index) => {
                                    const normalizedX = maxX === minX ? 0.5 : (point.x - minX) / (maxX - minX);
                                    const x = PADDING_LEFT + (normalizedX * PLOT_WIDTH);
                                    const y = height - PADDING_VERTICAL - (((point.y - displayMinY) / displayRange) * (height - (PADDING_VERTICAL * 2)));

                                    const isSelected = selectedIndex === index;

                                    return (
                                        <React.Fragment key={index}>
                                            {isSelected && (
                                                <>
                                                    <Circle
                                                        cx={x}
                                                        cy={y}
                                                        r={REPORT_CHART_LAYOUT.lineChartSelectedPointRadius}
                                                        fill={chartColor}
                                                        stroke={theme.surface}
                                                        strokeWidth={REPORT_CHART_LAYOUT.lineChartSelectedPointStrokeWidth}
                                                    />
                                                    {/* Vertical Line indicator */}
                                                    <Path
                                                        d={`M ${x} ${height - PADDING_VERTICAL} L ${x} ${y + REPORT_CHART_LAYOUT.lineChartSelectedIndicatorOffsetY}`}
                                                        stroke={chartColor}
                                                        strokeWidth={REPORT_CHART_LAYOUT.lineChartSelectedIndicatorStrokeWidth}
                                                        strokeDasharray="4,4"
                                                        opacity={REPORT_CHART_LAYOUT.lineChartSelectedSeriesOpacity}
                                                    />
                                                </>
                                            )}
                                            {/* Invisible touch target removed - handled by PanGesture */}
                                        </React.Fragment>
                                    );
                                })}
                            </Svg>
                        </View>
                    </GestureDetector>
                </GestureHandlerRootView>
            </View>

            {/* Render Tooltip Overlay - Outside gesture detector but inside main container */}
            {selectedPointInfo && renderTooltip && (
                <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
                    {renderTooltip({
                        index: selectedIndex!,
                        x: selectedPointInfo.x,
                        y: selectedPointInfo.y,
                        dataPoint: selectedPointInfo.point
                    })}
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        borderRadius: REPORT_CHART_LAYOUT.lineChartBorderRadius,
        overflow: 'hidden',
    }
});
