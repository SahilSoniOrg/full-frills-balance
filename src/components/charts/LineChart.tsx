import { AppText } from '@/src/components/core';
import { Spacing } from '@/src/constants';
import { AppConfig } from '@/src/constants/app-config';
import { REPORT_CHART_LAYOUT } from '@/src/constants/report-constants';
import { resolveThemeColor } from '@/src/design-system/utils';
import { useTheme } from '@/src/hooks/use-theme';
import { InteractionState, useChartInteraction } from '@/src/hooks/useChartInteraction';
import React, { useCallback, useMemo } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Svg, { Defs, LinearGradient, Stop } from 'react-native-svg';
import { ChartTooltip } from './ChartTooltip';
import {
  computeLineChartGeometry,
  DataPoint,
  findNearestIndex,
  HorizontalLine,
} from './line/chartMath';
import { LineChartGrid } from './line/LineChartGrid';
import { LineChartSeries } from './line/LineChartSeries';

export type { DataPoint, HorizontalLine };

export interface LineChartProps<T extends DataPoint = DataPoint> {
  data: T[];
  currencyCode: string;
  height?: number;
  color?: string;
  showGradient?: boolean;
  width?: number;
  onPress?: (index: number) => void;
  selectedIndex?: number;
  domainX?: [number, number];
  renderTooltipContent?: (index: number) => React.ReactNode;
  tooltipWidth?: number;
  tooltipHeight?: number;
  xTicks?: number[];
  formatXTick?: (x: number) => string;
  secondaryData?: T[];
  secondaryColor?: string;
  todayX?: number;
  extraHorizontalLines?: HorizontalLine[];
  avoidPointVertical?: boolean;
  offset?: number;
}

export const LineChart = <T extends DataPoint>({
  data,
  height: propHeight,
  color,
  showGradient = true,
  width: customWidth,
  onPress,
  selectedIndex,
  domainX,
  renderTooltipContent,
  xTicks,
  formatXTick,
  secondaryData,
  secondaryColor,
  todayX,
  extraHorizontalLines,
  avoidPointVertical = false,
  offset = 15,
  tooltipWidth,
  tooltipHeight,
  currencyCode,
}: LineChartProps<T>) => {
  const { theme } = useTheme();
  const chartColor = resolveThemeColor(theme, color) || theme.primary;
  const resolvedSecondaryColor = resolveThemeColor(theme, secondaryColor);
  const { width: windowWidth } = Dimensions.get('window');
  const chartWidth = customWidth || windowWidth - Spacing.lg * 2;
  const paddingVertical = Spacing.lg;
  const paddingLeft = Spacing.xl * 2;
  const paddingRight = Spacing.lg;
  const plotWidth = Math.max(0, chartWidth - paddingLeft - paddingRight);
  const height = propHeight ?? REPORT_CHART_LAYOUT.lineChartDefaultHeight;

  const geometry = useMemo(
    () =>
      computeLineChartGeometry({
        data,
        secondaryData,
        domainX,
        height,
        plotWidth,
        paddingVertical,
        paddingLeft,
      }),
    [data, secondaryData, domainX, height, plotWidth, paddingVertical, paddingLeft],
  );

  const {
    path,
    secondaryPath,
    gradientPath,
    minX,
    maxX,
    displayMinY,
    displayRange,
    maxValPoint,
    sortedData,
  } = geometry;

  const [internalSelectedIndex, setInternalSelectedIndex] = React.useState<number | undefined>(
    undefined,
  );

  const isControlled = selectedIndex !== undefined;
  const activeIndex = isControlled ? selectedIndex : internalSelectedIndex;

  const { chartRef, onLayout, gesture } = useChartInteraction({
    gestureConfig: {
      activeOffsetX: REPORT_CHART_LAYOUT.gestureSensitivity,
      type: 'exclusive',
    },
    getInteractionFromTouch: useCallback(
      (x: number, _y: number) => {
        if (sortedData.length === 0) return { type: 'none' };

        const relativeX = x - paddingLeft;
        const normalizedX = Math.max(0, Math.min(1, relativeX / plotWidth));
        const targetX = minX + normalizedX * (maxX - minX);

        const closestIndex = findNearestIndex(sortedData, targetX);
        return { type: 'index', index: closestIndex };
      },
      [sortedData, paddingLeft, plotWidth, minX, maxX],
    ),
    onInteractionChange: useCallback(
      (state: InteractionState) => {
        const index = state.type === 'index' ? state.index : -1;
        if (onPress) onPress(index);
        if (!isControlled) setInternalSelectedIndex(index === -1 ? undefined : index);
      },
      [onPress, isControlled, setInternalSelectedIndex],
    ),
    enabled: sortedData.length > 0,
  });

  const selectedPointInfo = useMemo(() => {
    if (
      activeIndex === undefined ||
      activeIndex === -1 ||
      !sortedData[activeIndex] ||
      sortedData.length === 0
    ) {
      return null;
    }

    const xRange = maxX - minX;
    const point = sortedData[activeIndex];
    const normalizedX = xRange === 0 ? 0.5 : (point.x - minX) / xRange;
    const x = paddingLeft + normalizedX * plotWidth;
    const y =
      height -
      paddingVertical -
      ((point.y - displayMinY) / displayRange) * (height - paddingVertical * 2);

    return { x, y, point };
  }, [
    activeIndex,
    sortedData,
    minX,
    maxX,
    displayMinY,
    displayRange,
    height,
    plotWidth,
    paddingLeft,
    paddingVertical,
  ]);

  const todayDataPoint = useMemo(() => {
    if (todayX === undefined) return undefined;
    return data.find(d => Math.abs(d.x - todayX) < 1000);
  }, [data, todayX]);

  if (data.length === 0) {
    return (
      <View
        style={[
          styles.container,
          {
            height,
            borderColor: theme.border,
            borderWidth: 1,
            justifyContent: 'center',
            alignItems: 'center',
          },
        ]}
      >
        <AppText color="secondary">{AppConfig.strings.reports.chartNoData}</AppText>
      </View>
    );
  }

  return (
    <View
      style={{ height, width: chartWidth, overflow: 'visible' }}
      ref={chartRef}
      collapsable={false}
      onLayout={onLayout}
    >
      <View style={{ width: chartWidth, height, overflow: 'visible', zIndex: 0 }}>
        <GestureDetector gesture={gesture}>
          <View style={{ width: chartWidth, height, zIndex: 0 }}>
            <Svg height={height} width={chartWidth}>
              <Defs>
                <LinearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={chartColor} stopOpacity="0.5" />
                  <Stop offset="1" stopColor={chartColor} stopOpacity="0" />
                </LinearGradient>
              </Defs>

              <LineChartGrid
                displayMinY={displayMinY}
                displayRange={displayRange}
                minX={minX}
                maxX={maxX}
                height={height}
                chartWidth={chartWidth}
                plotWidth={plotWidth}
                paddingLeft={paddingLeft}
                paddingRight={paddingRight}
                paddingVertical={paddingVertical}
                currencyCode={currencyCode}
                theme={theme}
                chartColor={chartColor}
                xTicks={xTicks}
                formatXTick={formatXTick}
                todayX={todayX}
                todayDataPoint={todayDataPoint}
                extraHorizontalLines={extraHorizontalLines}
                maxValPoint={maxValPoint}
              />

              <LineChartSeries
                data={data}
                path={path}
                secondaryPath={secondaryPath}
                gradientPath={gradientPath}
                showGradient={showGradient}
                chartColor={chartColor}
                secondaryColor={resolvedSecondaryColor || theme.textSecondary}
                activeIndex={activeIndex}
                minX={minX}
                maxX={maxX}
                displayMinY={displayMinY}
                displayRange={displayRange}
                height={height}
                plotWidth={plotWidth}
                paddingLeft={paddingLeft}
                paddingVertical={paddingVertical}
                surfaceColor={theme.surface}
              />
            </Svg>
          </View>
        </GestureDetector>
      </View>

      {selectedPointInfo && renderTooltipContent && (
        <View
          style={[StyleSheet.absoluteFill, { zIndex: 100, elevation: 100 }]}
          pointerEvents="box-none"
        >
          <ChartTooltip
            x={selectedPointInfo.x}
            y={selectedPointInfo.y}
            containerWidth={chartWidth}
            containerHeight={height}
            tooltipWidth={tooltipWidth}
            tooltipHeight={tooltipHeight}
            offset={offset}
            edgePadding={REPORT_CHART_LAYOUT.gestureSensitivity * 2}
            avoidPointVertical={avoidPointVertical}
          >
            {renderTooltipContent(activeIndex!)}
          </ChartTooltip>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: REPORT_CHART_LAYOUT.lineChartBorderRadius,
    overflow: 'hidden',
  },
});
