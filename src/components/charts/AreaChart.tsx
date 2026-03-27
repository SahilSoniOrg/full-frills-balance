import { Spacing } from '@/src/constants';
import { REPORT_CHART_EVENTS, REPORT_CHART_LAYOUT } from '@/src/constants/report-constants';
import { useTheme } from '@/src/hooks/use-theme';
import { triggerHaptic } from '@/src/utils/haptics';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DeviceEventEmitter, Dimensions, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { useChartTooltipPosition } from '@/src/hooks/useChartTooltipPosition';
import { ChartTooltip } from './ChartTooltip';

export interface DataPoint {
    x: number;
    y: number;
}

interface AreaChartProps {
    series: DataPoint[][];
    colors?: string[];
    height?: number;
    width?: number;
    onPress?: (index: number) => void;
    selectedIndex?: number;
    renderTooltip?: (index: number, x: number, y: number) => React.ReactNode;
}

export const AreaChart: React.FC<AreaChartProps> = ({
    series,
    colors,
    height = REPORT_CHART_LAYOUT.areaChartDefaultHeight,
    width: customWidth,
    onPress,
    selectedIndex,
    renderTooltip,
}) => {
    const { theme } = useTheme();
    const windowWidth = Dimensions.get('window').width;
    const CHART_WIDTH = customWidth || (windowWidth - Spacing.lg * 2);

    const PADDING_V = REPORT_CHART_LAYOUT.areaChartPaddingV;
    const PADDING_H = REPORT_CHART_LAYOUT.areaChartPaddingH;

    const [internalSelectedIndex, setInternalSelectedIndex] = useState<number | undefined>(undefined);
    const activeIndex = selectedIndex !== undefined ? selectedIndex : internalSelectedIndex;
    const lastGestureIndex = useRef(-1);
    const chartRef = useRef<View>(null);

    useEffect(() => {
        const sub = DeviceEventEmitter.addListener(REPORT_CHART_EVENTS.globalTouch, (e) => {
            if (activeIndex !== undefined && activeIndex !== -1) {
                chartRef.current?.measure((_x, _y, _width, height, pageX, pageY) => {
                    const { pageX: touchX, pageY: touchY } = e;
                    const isInside = touchX >= pageX && touchX <= pageX + _width && touchY >= pageY && touchY <= pageY + height;
                    if (!isInside) {
                        setInternalSelectedIndex(undefined);
                        if (onPress) onPress(-1);
                    }
                });
            }
        });
        return () => sub.remove();
    }, [activeIndex, onPress]);

    const { paths, gradients, getX, getY, PLOT_WIDTH } = useMemo(() => {
        if (series.length === 0 || series[0].length === 0) {
            return { paths: [], gradients: [], getX: (_px: number) => 0, getY: (_py: number) => 0, PLOT_WIDTH: CHART_WIDTH };
        }

        const allY = series.flat().map(p => p.y);
        const allX = series.flat().map(p => p.x);

        const minY = Math.min(...allY, 0);
        const maxY = Math.max(...allY, 1);
        const minX = Math.min(...allX);
        const maxX = Math.max(...allX);

        const xRange = maxX - minX || 1;
        const yRange = maxY - minY || 1;

        const getX = (px: number) => PADDING_H + ((px - minX) / xRange) * (CHART_WIDTH - PADDING_H * 2);
        const getY = (py: number) => height - PADDING_V - ((py - minY) / yRange) * (height - PADDING_V * 2);

        return {
            minX,
            maxX,
            PLOT_WIDTH: CHART_WIDTH - PADDING_H * 2,
            getX,
            getY,
            paths: series.map((data) => {
                let linePath = "";
                let areaPath = "";

                data.forEach((p, i) => {
                    const x = getX(p.x);
                    const y = getY(p.y);

                    if (i === 0) {
                        linePath += `M ${x} ${y}`;
                        areaPath += `M ${x} ${y}`;
                    } else {
                        const prev = data[i - 1];
                        const prevX = getX(prev.x);
                        const prevY = getY(prev.y);

                        const cp1x = prevX + (x - prevX) * 0.5;
                        const cp2x = prevX + (x - prevX) * 0.5;

                        linePath += ` C ${cp1x} ${prevY}, ${cp2x} ${y}, ${x} ${y}`;
                        areaPath += ` C ${cp1x} ${prevY}, ${cp2x} ${y}, ${x} ${y}`;
                    }
                });

                const last = data[data.length - 1];
                const first = data[0];
                const zeroY = getY(0);

                areaPath += ` L ${getX(last.x)} ${zeroY} L ${getX(first.x)} ${zeroY} Z`;

                return { linePath, areaPath };
            }),
            gradients: series.map((_, i) => ({
                id: `grad-${i}`,
                color: colors?.[i] || (i === 0 ? theme.primary : theme.error)
            }))
        };
    }, [series, height, CHART_WIDTH, colors, theme]);

    const handleGesture = (x: number, isStart: boolean) => {
        if (series.length === 0 || series[0].length === 0) return;

        const relativeX = x - PADDING_H;
        const data = series[0];

        let index = -1;
        if (data.length === 1) {
            index = 0;
        } else if (relativeX < 0) {
            index = 0;
        } else if (relativeX > PLOT_WIDTH) {
            index = data.length - 1;
        } else {
            const step = PLOT_WIDTH / (data.length - 1);
            index = Math.round(relativeX / step);
        }

        if (index >= 0 && index < data.length) {
            if (isStart || index !== lastGestureIndex.current) {
                lastGestureIndex.current = index;
                triggerHaptic('light');
                if (onPress) onPress(index);
                setInternalSelectedIndex(index);
            }
        }
    };

    const pan = Gesture.Pan()
        .activeOffsetX([-REPORT_CHART_LAYOUT.gestureSensitivity, REPORT_CHART_LAYOUT.gestureSensitivity])
        .onBegin((e) => {
            runOnJS(handleGesture)(e.x, true);
        })
        .onUpdate((e) => {
            runOnJS(handleGesture)(e.x, false);
        });

    const selectedX = useMemo(() => {
        if (activeIndex === undefined || activeIndex === -1 || !series[0]?.[activeIndex]) return null;
        return getX(series[0][activeIndex].x);
    }, [activeIndex, series, getX]);

    const getTooltipPosition = useChartTooltipPosition({
        containerWidth: CHART_WIDTH,
        containerHeight: height,
        offset: 15,
        edgePadding: REPORT_CHART_LAYOUT.gestureSensitivity * 2,
    });

    return (
        <View style={{ width: CHART_WIDTH, height, overflow: 'visible' }} ref={chartRef} collapsable={false}>
            <GestureDetector gesture={pan}>
                <View style={{ width: CHART_WIDTH, height }}>
                    <Svg height={height} width={CHART_WIDTH} style={{ overflow: 'visible' }}>
                        <Defs>
                            {gradients.map(g => (
                                <LinearGradient key={g.id} id={g.id} x1="0" y1="0" x2="0" y2="1">
                                    <Stop offset="0" stopColor={g.color} stopOpacity="0.3" />
                                    <Stop offset="1" stopColor={g.color} stopOpacity="0" />
                                </LinearGradient>
                            ))}
                        </Defs>

                        {paths.map((p, i) => (
                            <React.Fragment key={i}>
                                <Path d={p.areaPath} fill={`url(#grad-${i})`} />
                                <Path
                                    d={p.linePath}
                                    stroke={gradients[i].color}
                                    strokeWidth={2.5}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    fill="none"
                                />
                            </React.Fragment>
                        ))}

                        {selectedX !== null && (
                            <G>
                                <Line
                                    x1={selectedX}
                                    y1={PADDING_V}
                                    x2={selectedX}
                                    y2={height - PADDING_V}
                                    stroke={theme.textSecondary}
                                    strokeWidth={1}
                                    strokeDasharray="4,4"
                                    opacity={0.6}
                                />
                                {series.map((data, i) => {
                                    const point = data[activeIndex!];
                                    if (!point) return null;
                                    return (
                                        <Circle
                                            key={i}
                                            cx={selectedX}
                                            cy={getY(point.y)}
                                            r={4}
                                            fill={gradients[i].color}
                                            stroke={theme.surface}
                                            strokeWidth={2}
                                        />
                                    );
                                })}
                            </G>
                        )}
                    </Svg>
                </View>
            </GestureDetector>

            {activeIndex !== undefined && renderTooltip && selectedX !== null && (
                <View style={[StyleSheet.absoluteFill, { zIndex: 1000 }]} pointerEvents="box-none">
                    {(() => {
                        const y = getY(series[0][activeIndex].y);
                        const pos = getTooltipPosition(selectedX, y);
                        return (
                            <ChartTooltip
                                x={selectedX}
                                y={y}
                                {...pos}
                            >
                                {renderTooltip(activeIndex, selectedX, y)}
                            </ChartTooltip>
                        );
                    })()}
                </View>
            )}
        </View>
    );
};
