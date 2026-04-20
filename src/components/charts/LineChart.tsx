import { AppText } from '@/src/components/core';
import { Layout, Spacing } from '@/src/constants';
import { REPORT_CHART_LAYOUT, REPORT_CHART_STRINGS } from '@/src/constants/report-constants';
import { resolveThemeColor } from '@/src/design-system/utils';
import { useTheme } from '@/src/hooks/use-theme';
import { InteractionState, useChartInteraction } from '@/src/hooks/useChartInteraction';
import { useChartTooltipPosition } from '@/src/hooks/useChartTooltipPosition';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import React, { useCallback, useMemo } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { ChartTooltip } from './ChartTooltip';

export interface DataPoint {
  x: number; // timestamp
  y: number; // value
  [key: string]: any; // Allow arbitrary extra data to be passed to tooltips
}

export interface HorizontalLine {
  value: number;
  label?: string;
  color?: string;
  strokeDasharray?: string;
}

interface LineChartProps<T extends DataPoint = DataPoint> {
  data: T[];
  height?: number;
  color?: string;
  showGradient?: boolean;
  width?: number;
  onPress?: (index: number) => void;
  selectedIndex?: number;
  domainX?: [number, number]; // [min, max] bound for the time range
  renderTooltipContent?: (index: number) => React.ReactNode; // Content to render inside built-in popup
  tooltipWidth?: number; // Needed if using renderTooltipContent
  tooltipHeight?: number; // Needed if using renderTooltipContent
  xTicks?: number[]; // Array of X values where ticks/grid lines should be drawn
  formatXTick?: (x: number) => string; // Function to format the tick labels
  secondaryData?: T[]; // Optional secondary line data
  secondaryColor?: string; // Color for the secondary line
  todayX?: number; // Timestamp for the 'Today' vertical marker
  hideLabels?: boolean; // Whether to hide axis labels (Privacy Mode)
  extraHorizontalLines?: HorizontalLine[]; // Arbitrary reference lines (e.g., 0 balance, safe-to-spend floor)
  avoidPointVertical?: boolean; // Whether to place tooltip above/below point instead of centered
  offset?: number; // Distance from point to tooltip
}

export const LineChart = <T extends DataPoint>({
  data,
  height = Layout.chart.line.defaultHeight,
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
  hideLabels,
  extraHorizontalLines,
  avoidPointVertical = false,
  offset = 15,
}: LineChartProps<T>) => {
  const { theme } = useTheme();
  const chartColor = resolveThemeColor(theme, color) || theme.primary;
  const resolvedSecondaryColor = resolveThemeColor(theme, secondaryColor);
  const { width: windowWidth } = Dimensions.get('window');
  const CHART_WIDTH = customWidth || windowWidth - Spacing.lg * 2; // Padding
  const PADDING_VERTICAL = Spacing.lg;
  const PADDING_LEFT = Spacing.xl * 2; // More space for scale (approx 40px)
  const PADDING_RIGHT = Spacing.lg; // Prevent right-side clipping
  const PLOT_WIDTH = Math.max(0, CHART_WIDTH - PADDING_LEFT - PADDING_RIGHT);

  const { path, secondaryPath, gradientPath, minX, maxX, displayMinY, displayRange, maxValPoint } =
    useMemo(() => {
      if (data.length === 0)
        return {
          path: '',
          secondaryPath: '',
          gradientPath: '',
          minX: 0,
          maxX: 0,
          displayMinY: 0,
          displayRange: 0,
          maxValPoint: undefined,
        };

      const yValues = data.map(d => d.y);
      const xValues = data.map(d => d.x);

      if (secondaryData && secondaryData.length > 0) {
        yValues.push(...secondaryData.map(d => d.y));
        xValues.push(...secondaryData.map(d => d.x));
      }

      const minX = domainX ? domainX[0] : Math.min(...xValues);
      const maxX = domainX ? domainX[1] : Math.max(...xValues);
      const minY = Math.min(...yValues);
      const maxY = Math.max(...yValues);

      // Add some padding to Y range
      const yRange = maxY - minY || 1;
      const displayMinY = minY - yRange * 0.1;
      const displayMaxY = maxY + yRange * 0.1;
      const displayRange = displayMaxY - displayMinY;
      const xRange = maxX - minX;

      // Determine max value point for annotation (only from primary data)
      const maxValIndex = data.map(d => d.y).indexOf(Math.max(...data.map(d => d.y)));
      const maxValPoint = maxValIndex >= 0 ? data[maxValIndex] : undefined;

      let pathStr = '';
      let gradientPathStr = '';

      data.forEach((point, index) => {
        const normalizedX = xRange === 0 ? 0.5 : (point.x - minX) / xRange;
        const x = PADDING_LEFT + normalizedX * PLOT_WIDTH;
        // Invert Y because SVG 0 is top
        const y =
          height -
          PADDING_VERTICAL -
          ((point.y - displayMinY) / displayRange) * (height - PADDING_VERTICAL * 2);

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
        const lastX = PADDING_LEFT + normalizedLastX * PLOT_WIDTH;
        gradientPathStr += ` L ${lastX} ${height - PADDING_VERTICAL} L ${PADDING_LEFT} ${height - PADDING_VERTICAL} Z`;
      }

      let secondaryPathStr = '';
      if (secondaryData && secondaryData.length > 0) {
        secondaryData.forEach((point, index) => {
          const normalizedX = xRange === 0 ? 0.5 : (point.x - minX) / xRange;
          const x = PADDING_LEFT + normalizedX * PLOT_WIDTH;
          const y =
            height -
            PADDING_VERTICAL -
            ((point.y - displayMinY) / displayRange) * (height - PADDING_VERTICAL * 2);

          if (index === 0) {
            secondaryPathStr += `M ${x} ${y}`;
          } else {
            secondaryPathStr += ` L ${x} ${y}`;
          }
        });
      }

      return {
        path: pathStr,
        secondaryPath: secondaryPathStr,
        gradientPath: gradientPathStr,
        minX,
        maxX,
        displayMinY,
        displayRange,
        maxValPoint,
      };
    }, [data, height, PLOT_WIDTH, PADDING_VERTICAL, PADDING_LEFT, domainX, secondaryData]);

  const [internalSelectedIndex, setInternalSelectedIndex] = React.useState<number | undefined>(
    undefined,
  );

  // Unify state: props.selectedIndex always wins. If not provided, use internal state.
  const isControlled = selectedIndex !== undefined;
  const activeIndex = isControlled ? selectedIndex : internalSelectedIndex;

  const { chartRef, onLayout, handleGesture } = useChartInteraction({
    getInteractionFromTouch: useCallback(
      (x: number, _y: number) => {
        if (data.length === 0) return { type: 'none' };
        const relativeX = x - PADDING_LEFT;
        // Use PLOT_WIDTH for more accurate mapping
        const step = PLOT_WIDTH / (data.length - 1 || 1);
        const finalIndex = Math.round(relativeX / step);
        const clampedIndex = Math.max(0, Math.min(data.length - 1, finalIndex));
        return { type: 'index', index: clampedIndex };
      },
      [data.length, PADDING_LEFT, PLOT_WIDTH],
    ),
    onInteractionChange: useCallback(
      (state: InteractionState) => {
        const index = state.type === 'index' ? state.index : -1;
        if (onPress) onPress(index);
        if (!isControlled) setInternalSelectedIndex(index === -1 ? undefined : index);
      },
      [onPress, isControlled, setInternalSelectedIndex],
    ),
    enabled: data.length > 0,
  });

  const getTooltipPosition = useChartTooltipPosition({
    containerWidth: CHART_WIDTH,
    containerHeight: height,
    offset,
    edgePadding: REPORT_CHART_LAYOUT.gestureSensitivity * 2,
    avoidPointVertical,
  });

  const pan = Gesture.Pan()
    .activeOffsetX([
      -REPORT_CHART_LAYOUT.gestureSensitivity,
      REPORT_CHART_LAYOUT.gestureSensitivity,
    ])
    .onBegin(e => {
      runOnJS(handleGesture)(e.x, e.y, 'start');
    })
    .onUpdate(e => {
      runOnJS(handleGesture)(e.x, e.y, 'update');
    })
    .onEnd(e => {
      runOnJS(handleGesture)(e.x, e.y, 'end');
    });

  const selectedPointInfo = useMemo(() => {
    if (activeIndex === undefined || activeIndex === -1 || !data[activeIndex] || data.length === 0)
      return null;
    const xRange = maxX - minX;

    const point = data[activeIndex];
    const normalizedX = xRange === 0 ? 0.5 : (point.x - minX) / xRange;
    const x = PADDING_LEFT + normalizedX * PLOT_WIDTH;
    const y =
      height -
      PADDING_VERTICAL -
      ((point.y - displayMinY) / displayRange) * (height - PADDING_VERTICAL * 2);

    return { x, y, point };
  }, [
    activeIndex,
    data,
    minX,
    maxX,
    displayMinY,
    displayRange,
    height,
    PLOT_WIDTH,
    PADDING_LEFT,
    PADDING_VERTICAL,
  ]);

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
        <AppText color="secondary">{REPORT_CHART_STRINGS.chartNoData}</AppText>
      </View>
    );
  }

  return (
    <View
      style={{ height, width: CHART_WIDTH, overflow: 'visible', zIndex: 1 }}
      ref={chartRef}
      collapsable={false}
      onLayout={onLayout}
    >
      <View style={{ width: CHART_WIDTH, height, overflow: 'visible' }}>
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
              {REPORT_CHART_LAYOUT.lineChartTicks.map(t => {
                const val = displayMinY + t * displayRange;
                const y = height - PADDING_VERTICAL - t * (height - PADDING_VERTICAL * 2);
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
                      {hideLabels ? '••••' : CurrencyFormatter.formatShort(val)}
                    </SvgText>
                  </React.Fragment>
                );
              })}

              {/* X-Axis Grid Lines & Ticks */}
              {xTicks &&
                formatXTick &&
                xTicks.map((xVal, i) => {
                  const normalizedX = maxX === minX ? 0.5 : (xVal - minX) / (maxX - minX);
                  if (normalizedX < 0 || normalizedX > 1) return null;
                  const x = PADDING_LEFT + normalizedX * PLOT_WIDTH;
                  return (
                    <React.Fragment key={`xtick-${i}`}>
                      <Line
                        x1={x}
                        y1={PADDING_VERTICAL}
                        x2={x}
                        y2={height - Math.max(0, PADDING_VERTICAL - 5)}
                        stroke={theme.border}
                        strokeWidth={1}
                        strokeDasharray="4,4"
                        opacity={REPORT_CHART_LAYOUT.lineChartGridOpacity}
                      />
                      <SvgText
                        x={x}
                        y={height - Math.max(0, PADDING_VERTICAL - 20)}
                        fontSize={REPORT_CHART_LAYOUT.lineChartMaxLabelFontSize}
                        fill={theme.textSecondary}
                        textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
                      >
                        {formatXTick(xVal)}
                      </SvgText>
                    </React.Fragment>
                  );
                })}

              {/* Today marker */}
              {todayX !== undefined &&
                (() => {
                  const normalizedX = maxX === minX ? 0.5 : (todayX - minX) / (maxX - minX);
                  if (normalizedX < 0 || normalizedX > 1) return null;
                  const x = PADDING_LEFT + normalizedX * PLOT_WIDTH;
                  return (
                    <React.Fragment>
                      <Line
                        x1={x}
                        y1={PADDING_VERTICAL}
                        x2={x}
                        y2={height - PADDING_VERTICAL}
                        stroke={theme.textSecondary}
                        strokeWidth={1.5}
                        opacity={0.6}
                      />
                      <SvgText
                        x={x + 4}
                        y={PADDING_VERTICAL + 10}
                        fontSize={REPORT_CHART_LAYOUT.lineChartMaxLabelFontSize}
                        fill={theme.textSecondary}
                        textAnchor="start"
                        opacity={0.8}
                      >
                        Today
                      </SvgText>
                      {(() => {
                        const todayPoint = data.find(d => Math.abs(d.x - todayX) < 1000);
                        if (!todayPoint || hideLabels) return null;
                        const y =
                          height -
                          PADDING_VERTICAL -
                          ((todayPoint.y - displayMinY) / displayRange) *
                            (height - PADDING_VERTICAL * 2);

                        return (
                          <React.Fragment>
                            <Circle
                              cx={x}
                              cy={y}
                              r={4}
                              fill={chartColor}
                              stroke={theme.surface}
                              strokeWidth={1}
                            />
                            <SvgText
                              x={x + 4}
                              y={y - 8}
                              fontSize={11}
                              fontWeight="bold"
                              fill={chartColor}
                              textAnchor="start"
                            >
                              {CurrencyFormatter.formatShort(todayPoint.y)}
                            </SvgText>
                          </React.Fragment>
                        );
                      })()}
                    </React.Fragment>
                  );
                })()}

              {/* Extra Horizontal Reference Lines */}
              {extraHorizontalLines?.map((line, i) => {
                if (line.value < displayMinY || line.value > displayMinY + displayRange)
                  return null;
                const y =
                  height -
                  PADDING_VERTICAL -
                  ((line.value - displayMinY) / displayRange) * (height - PADDING_VERTICAL * 2);
                const lineColor = line.color || theme.textSecondary;

                return (
                  <React.Fragment key={`extra-h-${i}`}>
                    <Line
                      x1={PADDING_LEFT}
                      y1={y}
                      x2={CHART_WIDTH - PADDING_RIGHT}
                      y2={y}
                      stroke={lineColor}
                      strokeWidth={1}
                      strokeDasharray={line.strokeDasharray || '4,4'}
                      opacity={0.8}
                    />
                    {line.label && !hideLabels && (
                      <SvgText
                        x={CHART_WIDTH - PADDING_RIGHT - 4}
                        y={y - 6}
                        fontSize={REPORT_CHART_LAYOUT.lineChartMaxLabelFontSize}
                        fill={lineColor}
                        textAnchor="end"
                        fontWeight="bold"
                        opacity={0.9}
                      >
                        {line.label}
                      </SvgText>
                    )}
                  </React.Fragment>
                );
              })}

              {/* Max Value Annotation */}
              {maxValPoint &&
                (() => {
                  const normalizedX = maxX === minX ? 0.5 : (maxValPoint.x - minX) / (maxX - minX);
                  const x = PADDING_LEFT + normalizedX * PLOT_WIDTH;
                  const y =
                    height -
                    PADDING_VERTICAL -
                    ((maxValPoint.y - displayMinY) / displayRange) *
                      (height - PADDING_VERTICAL * 2);
                  return (
                    <React.Fragment>
                      <Circle
                        cx={x}
                        cy={y}
                        r={REPORT_CHART_LAYOUT.lineChartMaxPointRadius}
                        fill={chartColor}
                        opacity={0.8}
                      />
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

              {showGradient && <Path d={gradientPath} fill="url(#gradient)" />}
              <Path
                d={path}
                stroke={chartColor}
                strokeWidth={REPORT_CHART_LAYOUT.lineChartSeriesStrokeWidth}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={
                  activeIndex !== undefined && activeIndex !== -1
                    ? REPORT_CHART_LAYOUT.lineChartSelectedSeriesOpacity
                    : 1
                }
              />
              {secondaryPath ? (
                <Path
                  d={secondaryPath}
                  stroke={resolvedSecondaryColor || theme.textSecondary}
                  strokeWidth={REPORT_CHART_LAYOUT.lineChartSeriesStrokeWidth}
                  fill="none"
                  opacity={0.7}
                />
              ) : null}

              {/* Interactive Points */}
              {data.map((point, index) => {
                const normalizedX = maxX === minX ? 0.5 : (point.x - minX) / (maxX - minX);
                const x = PADDING_LEFT + normalizedX * PLOT_WIDTH;
                const y =
                  height -
                  PADDING_VERTICAL -
                  ((point.y - displayMinY) / displayRange) * (height - PADDING_VERTICAL * 2);

                const isSelected = activeIndex === index;

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
                        <Path
                          d={`M ${x} ${height - PADDING_VERTICAL} L ${x} ${y + REPORT_CHART_LAYOUT.lineChartSelectedIndicatorOffsetY}`}
                          stroke={chartColor}
                          strokeWidth={REPORT_CHART_LAYOUT.lineChartSelectedIndicatorStrokeWidth}
                          strokeDasharray="4,4"
                          opacity={REPORT_CHART_LAYOUT.lineChartSelectedSeriesOpacity}
                        />
                      </>
                    )}
                  </React.Fragment>
                );
              })}
            </Svg>
          </View>
        </GestureDetector>
      </View>

      {/* Built-in Tooltip Overlay */}
      {selectedPointInfo && renderTooltipContent && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 1000 }]} pointerEvents="box-none">
          {(() => {
            const info = selectedPointInfo;
            const pos = getTooltipPosition(info.x, info.y);

            return (
              <ChartTooltip x={info.x} y={info.y} avoidPointVertical={avoidPointVertical} {...pos}>
                {renderTooltipContent!(activeIndex!)}
              </ChartTooltip>
            );
          })()}
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
