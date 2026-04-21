import { Spacing } from '@/src/constants';
import { REPORT_CHART_LAYOUT } from '@/src/constants/report-constants';
import { useTheme } from '@/src/hooks/use-theme';
import { InteractionState, useChartInteraction } from '@/src/hooks/useChartInteraction';
import React, { useCallback, useMemo, useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Stop } from 'react-native-svg';
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
  renderTooltipContent?: (index: number) => React.ReactNode;
  tooltipWidth?: number;
  tooltipHeight?: number;
}

export const AreaChart: React.FC<AreaChartProps> = ({
  series,
  colors,
  height = REPORT_CHART_LAYOUT.areaChartDefaultHeight,
  width: customWidth,
  onPress,
  selectedIndex,
  renderTooltipContent,
  tooltipWidth,
  tooltipHeight,
}) => {
  const { theme } = useTheme();
  const windowWidth = Dimensions.get('window').width;
  const CHART_WIDTH = customWidth || windowWidth - Spacing.lg * 2;

  const PADDING_V = REPORT_CHART_LAYOUT.areaChartPaddingV;
  const PADDING_H = REPORT_CHART_LAYOUT.areaChartPaddingH;

  const [internalSelectedIndex, setInternalSelectedIndex] = useState<number | undefined>(undefined);
  const activeIndex = selectedIndex !== undefined ? selectedIndex : internalSelectedIndex;

  const data = series[0] || [];

  const { paths, getX, getY } = useMemo(() => {
    if (series.length === 0 || series[0].length === 0) {
      return {
        paths: [],
        getX: (_px: number) => 0,
        getY: (_py: number) => 0,
        PLOT_WIDTH: CHART_WIDTH,
      };
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
    const getY = (py: number) =>
      height - PADDING_V - ((py - minY) / yRange) * (height - PADDING_V * 2);

    return {
      minX,
      maxX,
      getX,
      getY,
      paths: series.map(data => {
        let linePath = '';
        let areaPath = '';

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
    };
  }, [series, height, CHART_WIDTH, PADDING_H, PADDING_V]);

  const gradients = useMemo(
    () =>
      series.map((_, i) => ({
        id: `grad-${i}`,
        color: colors?.[i] || (i === 0 ? theme.primary : theme.error),
      })),
    [series, colors, theme.primary, theme.error],
  );

  const selectedX = useMemo(() => {
    if (activeIndex === undefined || activeIndex === -1 || !series[0]?.[activeIndex]) return null;
    return getX(series[0][activeIndex].x);
  }, [activeIndex, series, getX]);

  const { chartRef, onLayout, gesture } = useChartInteraction({
    gestureConfig: {
      type: 'exclusive',
      activeOffsetX: REPORT_CHART_LAYOUT.gestureSensitivity,
    },
    getInteractionFromTouch: useCallback(
      (x: number, _y: number) => {
        const dataLength = data.length;
        if (dataLength === 0) return { type: 'none' };

        const relativeX = x - PADDING_H;
        const step = (CHART_WIDTH - PADDING_H * 2) / (dataLength - 1 || 1);
        const finalIndex = Math.round(relativeX / step);
        const clampedIndex = Math.max(0, Math.min(dataLength - 1, finalIndex));

        return { type: 'index', index: clampedIndex };
      },
      [data.length, PADDING_H, CHART_WIDTH],
    ),
    onInteractionChange: useCallback(
      (state: InteractionState) => {
        const index = state.type === 'index' ? state.index : -1;
        if (onPress) onPress(index);
        setInternalSelectedIndex(index === -1 ? undefined : index);
      },
      [onPress],
    ),
    enabled: data.length > 0,
  });

  return (
    <View
      style={{ width: CHART_WIDTH, height, overflow: 'visible' }}
      ref={chartRef}
      onLayout={onLayout}
      collapsable={false}
    >
      <GestureDetector gesture={gesture}>
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

      {activeIndex !== undefined &&
        activeIndex !== -1 &&
        renderTooltipContent &&
        selectedX !== null && (
          <View style={[StyleSheet.absoluteFill, { zIndex: 1000 }]} pointerEvents="box-none">
            {(() => {
              const y = getY(series[0][activeIndex].y);
              return (
                <ChartTooltip
                  x={selectedX}
                  y={y}
                  containerWidth={CHART_WIDTH}
                  containerHeight={height}
                  tooltipWidth={tooltipWidth}
                  tooltipHeight={tooltipHeight}
                  offset={15}
                  edgePadding={REPORT_CHART_LAYOUT.gestureSensitivity * 2}
                  avoidPointVertical={false}
                >
                  {renderTooltipContent(activeIndex)}
                </ChartTooltip>
              );
            })()}
          </View>
        )}
    </View>
  );
};
