import { MoneyText } from '@/src/components/common/MoneyText';
import { AppText } from '@/src/components/core';
import { Spacing } from '@/src/constants';
import { AppConfig } from '@/src/constants/app-config';
import { REPORT_CHART_LAYOUT } from '@/src/constants/report-constants';
import { useTheme } from '@/src/hooks/use-theme';
import { InteractionState, useChartInteraction } from '@/src/hooks/useChartInteraction';
import React, { useCallback, useMemo, useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { GestureDetector, ScrollView } from 'react-native-gesture-handler';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';
import { ChartTooltip } from './ChartTooltip';

/** Axis labels: MoneyText (RN overlay). Host under PrivacyScopeProvider. */
export interface BarChartDataPoint {
  label: string;
  values: number[]; // Array of values for multiple series (e.g. [Income, Expense])
  colors: string[]; // Corresponding colors for each value
}

interface BarChartProps {
  data: BarChartDataPoint[];
  currencyCode: string;
  height?: number;
  barWidth?: number;
  width?: number;
  onPress?: (index: number) => void;
  selectedIndex?: number;
  renderTooltipContent?: (index: number) => React.ReactNode;
  tooltipWidth?: number;
  tooltipHeight?: number;
}

interface BarChartSvgProps {
  data: BarChartDataPoint[];
  height: number;
  svgWidth: number;
  theme: ReturnType<typeof useTheme>['theme'];
  yForValue: (value: number) => number;
  domainMin: number;
  domainMax: number;
  groupWidth: number;
  centerOffset: number;
  paddingLeft: number;
  paddingRight: number;
  labelStartY: number;
  barWidth: number;
  barSpacing: number;
  startXOffset: number;
  selectedIndex?: number;
  onPress?: (index: number) => void;
}

// Scroll position only affects the overlay tooltip. Keeping the SVG subtree
// isolated prevents a scroll-only state update from remapping every bar.
const BarChartSvg = React.memo(function BarChartSvg({
  data,
  height,
  svgWidth,
  theme,
  yForValue,
  domainMin,
  domainMax,
  groupWidth,
  centerOffset,
  paddingLeft,
  paddingRight,
  labelStartY,
  barWidth,
  barSpacing,
  startXOffset,
  selectedIndex,
  onPress,
}: BarChartSvgProps) {
  return (
    <Svg height={height} width={svgWidth}>
      <Rect
        x={0}
        y={0}
        width={svgWidth}
        height={height}
        fill="transparent"
        onPress={() => onPress?.(-1)}
      />
      {REPORT_CHART_LAYOUT.yAxisTicks.map(t => {
        const y = yForValue(domainMin + t * (domainMax - domainMin));
        return (
          <Line
            key={t}
            x1={paddingLeft}
            y1={y}
            x2={svgWidth - paddingRight}
            y2={y}
            stroke={theme.border}
            strokeWidth={1}
            strokeDasharray="4,4"
          />
        );
      })}
      {data.map((point, index) => {
        const xGroupCenter = paddingLeft + index * groupWidth + centerOffset;

        return (
          <React.Fragment key={index}>
            {point.values.map((val, vIndex) => {
              const x = xGroupCenter + startXOffset + vIndex * (barWidth + barSpacing);
              const zeroY = yForValue(0);
              const valueY = yForValue(val);
              const y = Math.min(valueY, zeroY);
              const barHeight = Math.max(Math.abs(zeroY - valueY), 1);
              const isSelected = selectedIndex === index;
              const opacity =
                selectedIndex !== undefined && selectedIndex !== -1 && !isSelected
                  ? REPORT_CHART_LAYOUT.barChartUnselectedOpacity
                  : 1;

              return (
                <React.Fragment key={vIndex}>
                  <Rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={barHeight}
                    fill={point.colors[vIndex]}
                    rx={REPORT_CHART_LAYOUT.barChartBarCornerRadius}
                    opacity={opacity}
                    onPress={() => onPress?.(index)}
                  />
                  <Rect
                    x={x - barSpacing}
                    y={0}
                    width={barWidth + barSpacing * 2}
                    height={height}
                    fill="transparent"
                    onPress={() => onPress?.(index)}
                  />
                </React.Fragment>
              );
            })}
            <SvgText
              x={xGroupCenter}
              y={labelStartY}
              fontSize={REPORT_CHART_LAYOUT.barChartXAxisLabelFontSize}
              fill={theme.textSecondary}
              textAnchor="start"
              alignmentBaseline="hanging"
              transform={`rotate(90, ${xGroupCenter}, ${labelStartY})`}
            >
              {point.label}
            </SvgText>
          </React.Fragment>
        );
      })}
    </Svg>
  );
});

export const BarChart = ({
  data,
  height = REPORT_CHART_LAYOUT.barChartHeight,
  barWidth = REPORT_CHART_LAYOUT.barChartDefaultBarWidth,
  width: customWidth,
  onPress,
  selectedIndex,
  renderTooltipContent,
  tooltipWidth,
  tooltipHeight,
  currencyCode,
}: BarChartProps) => {
  const { theme } = useTheme();
  const { width: windowWidth } = Dimensions.get('window');
  const [scrollX, setScrollX] = useState(0);

  const containerWidth = customWidth || windowWidth - Spacing.lg * 2;
  const Y_AXIS_WIDTH = Spacing.xl * 2;
  const BAR_SPACING = REPORT_CHART_LAYOUT.barSpacing;
  const plotAreaWidth = Math.max(containerWidth - Y_AXIS_WIDTH, 0);
  const minContentWidth = data.length * (barWidth + BAR_SPACING * 2);
  const svgWidth = Math.max(plotAreaWidth, minContentWidth);

  const PADDING_LEFT = Spacing.sm;
  const PADDING_RIGHT = Spacing.lg;
  const PADDING_VERTICAL = Spacing.lg;
  const PADDING_BOTTOM = Spacing.xxxxl + Spacing.xxxl; // Dedicated label band for vertical date text

  const { processedData, domainMin, domainMax, domainRange } = useMemo(() => {
    if (data.length === 0) return { processedData: [], domainMin: 0, domainMax: 1, domainRange: 1 };

    const allValues = data.flatMap(d => d.values);
    const min = Math.min(...allValues, 0);
    const max = Math.max(...allValues, 0);
    const valueRange = max - min || 1;
    const padding = valueRange * 0.1;

    const adjustedMin = min < 0 ? min - padding : min;
    const adjustedMax = max > 0 ? max + padding : max;
    const adjustedRange = adjustedMax - adjustedMin || 1;

    return {
      processedData: data,
      domainMin: adjustedMin,
      domainMax: adjustedMax,
      domainRange: adjustedRange,
    };
  }, [data]);

  const chartHeight = height - PADDING_VERTICAL - PADDING_BOTTOM;
  const yForValue = useCallback(
    (value: number) => height - PADDING_BOTTOM - ((value - domainMin) / domainRange) * chartHeight,
    [PADDING_BOTTOM, chartHeight, domainMin, domainRange, height],
  );

  const hasData = data.length > 0;
  const groupWidth = hasData ? (svgWidth - PADDING_LEFT - PADDING_RIGHT) / data.length : 0;
  const centerOffset = groupWidth / 2;
  const labelStartY = height - PADDING_BOTTOM + Spacing.sm;
  // Calculate total width of a group of bars (barWidth * numSeries + spacing)
  const seriesCount = hasData ? data[0].values.length : 0;
  const totalGroupBarWidth = seriesCount * barWidth + (seriesCount - 1) * BAR_SPACING;
  const startXOffset = -totalGroupBarWidth / 2;

  const tooltipElement = useMemo(() => {
    if (selectedIndex === undefined || selectedIndex === -1 || !renderTooltipContent) return null;

    const point = processedData[selectedIndex];
    if (!point) return null;

    const xGroupCenter = PADDING_LEFT + selectedIndex * groupWidth + centerOffset;

    const y = Math.min(yForValue(0), ...point.values.map(value => yForValue(value)));

    // Convert chart-content coordinates to visible viewport coordinates.
    const viewportX = Y_AXIS_WIDTH + xGroupCenter - scrollX;
    return { index: selectedIndex, x: viewportX, y };
  }, [
    selectedIndex,
    processedData,
    groupWidth,
    centerOffset,
    PADDING_LEFT,
    Y_AXIS_WIDTH,
    scrollX,
    yForValue,
    renderTooltipContent,
  ]);

  const { chartRef, onLayout, gesture } = useChartInteraction({
    gestureConfig: {
      type: 'simultaneous',
      activateAfterLongPress: 150,
    },
    getInteractionFromTouch: useCallback(
      (x: number, _y: number) => {
        if (data.length === 0) return { type: 'none' };
        const relativeX = x + scrollX - PADDING_LEFT;
        let finalIndex = -1;
        if (groupWidth > 0) {
          finalIndex = Math.floor(relativeX / groupWidth);
        }
        const clampedIndex = Math.max(0, Math.min(data.length - 1, finalIndex));
        return { type: 'index', index: clampedIndex };
      },
      [data.length, scrollX, PADDING_LEFT, groupWidth],
    ),
    onInteractionChange: useCallback(
      (state: InteractionState) => {
        if (state.type === 'index') {
          onPress?.(state.index);
        } else if (state.type === 'none') {
          onPress?.(-1);
        }
      },
      [onPress],
    ),
    enabled: data.length > 0,
  });

  if (data.length === 0) {
    return (
      <View style={[styles.container, { height, borderColor: theme.border }]}>
        <AppText color="secondary">{AppConfig.strings.reports.chartNoData}</AppText>
      </View>
    );
  }

  return (
    <View
      style={{ height, width: containerWidth }}
      ref={chartRef}
      collapsable={false}
      onLayout={onLayout}
    >
      <View style={styles.chartRow}>
        <View style={[styles.yAxisColumn, { width: Y_AXIS_WIDTH }]}>
          {REPORT_CHART_LAYOUT.yAxisTicks.map(t => {
            const tickValue = domainMin + t * (domainMax - domainMin);
            const y = yForValue(tickValue);
            return (
              <View
                key={t}
                style={[styles.yAxisTick, { top: y - REPORT_CHART_LAYOUT.barChartAxisTickOffsetY }]}
              >
                <MoneyText
                  amount={tickValue}
                  currencyCode={currencyCode}
                  formatStyle="short"
                  variant="caption"
                  color="secondary"
                  style={styles.yAxisLabel}
                />
              </View>
            );
          })}
        </View>
        <GestureDetector gesture={gesture}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            onScroll={event => setScrollX(event.nativeEvent.contentOffset.x)}
            onScrollBeginDrag={() => onPress?.(-1)}
            scrollEventThrottle={16}
          >
            <View>
              <BarChartSvg
                data={processedData}
                height={height}
                svgWidth={svgWidth}
                theme={theme}
                yForValue={yForValue}
                domainMin={domainMin}
                domainMax={domainMax}
                groupWidth={groupWidth}
                centerOffset={centerOffset}
                paddingLeft={PADDING_LEFT}
                paddingRight={PADDING_RIGHT}
                labelStartY={labelStartY}
                barWidth={barWidth}
                barSpacing={BAR_SPACING}
                startXOffset={startXOffset}
                selectedIndex={selectedIndex}
                onPress={onPress}
              />
            </View>
          </ScrollView>
        </GestureDetector>
      </View>
      {tooltipElement && renderTooltipContent && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 1000 }]} pointerEvents="box-none">
          <ChartTooltip
            x={tooltipElement.x}
            y={tooltipElement.y}
            containerWidth={containerWidth}
            containerHeight={height}
            tooltipWidth={tooltipWidth}
            tooltipHeight={tooltipHeight}
            offset={15}
            edgePadding={Spacing.sm}
            avoidPointVertical={true}
          >
            {renderTooltipContent(tooltipElement.index)}
          </ChartTooltip>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  chartRow: {
    flexDirection: 'row',
  },
  yAxisColumn: {
    position: 'relative',
    height: '100%',
  },
  yAxisTick: {
    position: 'absolute',
    right: Spacing.xs,
  },
  yAxisLabel: {
    fontSize: REPORT_CHART_LAYOUT.barChartAxisLabelFontSize,
  },
  container: {
    borderWidth: 1,
    borderRadius: REPORT_CHART_LAYOUT.barChartEmptyBorderRadius,
    justifyContent: 'center',
    alignItems: 'center',
    borderStyle: 'dashed',
  },
});
