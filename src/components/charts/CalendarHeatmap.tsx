import { MoneyText } from '@/src/components/common/MoneyText';
import { AppText } from '@/src/components/core';
import { Opacity, Spacing } from '@/src/constants';
import { REPORT_CHART_LAYOUT } from '@/src/constants/report-constants';
import { useTheme } from '@/src/hooks/use-theme';
import { InteractionState, useChartInteraction } from '@/src/hooks/useChartInteraction';
import { HeatmapPoint } from '@/src/services/reports/reportSnapshot';
import dayjs from 'dayjs';
import React, { useCallback, useMemo, useState } from 'react';
import { Dimensions, StyleSheet, TouchableOpacity, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Svg, { G, Rect, Text as SvgText } from 'react-native-svg';
import { ChartTooltip } from './ChartTooltip';

/** Selection tooltips: MoneyText (RN overlay). Host under PrivacyScopeProvider. */
interface CalendarHeatmapProps {
  data: HeatmapPoint[];
  height?: number;
  width?: number;
  title?: string;
  currency: string;
  onCellPress?: (point: HeatmapPoint) => void;
  renderTooltipContent?: (col: number, row: number) => React.ReactNode;
  tooltipWidth?: number;
  tooltipHeight?: number;
}

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export const CalendarHeatmap: React.FC<CalendarHeatmapProps> = ({
  data,
  height = REPORT_CHART_LAYOUT.calendarDefaultHeight,
  width: customWidth,
  title = 'Activity',
  currency,
  onCellPress,
  renderTooltipContent,
  tooltipWidth,
  tooltipHeight,
}) => {
  const { theme, onContrast, blend } = useTheme();
  const [selectedPoint, setSelectedPoint] = useState<HeatmapPoint | null>(null);

  const windowWidth = Dimensions.get('window').width;
  const CHART_WIDTH = customWidth || windowWidth - Spacing.lg * 2;

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

  const cellWidth = (PLOT_WIDTH - 6 * CELL_SPACING) / 7;

  const maxValue = useMemo(() => Math.max(...data.map(p => p.value), 1), [data]);

  const pointMap = useMemo(() => {
    const map = new Map<string, HeatmapPoint>();
    data.forEach(p => map.set(`${p.x}_${p.y}`, p));
    return map;
  }, [data]);

  const getOpacity = (value: number) => {
    if (value === 0) return 0.04;
    return 0.15 + (Math.sqrt(value) / Math.sqrt(maxValue)) * 0.85;
  };

  const { chartRef, onLayout, gesture } = useChartInteraction({
    gestureConfig: {
      type: 'simultaneous',
    },
    getInteractionFromTouch: useCallback(
      (x: number, y: number) => {
        if (data.length === 0) return { type: 'none' };
        const col = Math.floor((x - PADDING_LEFT) / (cellWidth + CELL_SPACING));
        const row = Math.floor((y - PADDING_TOP) / (CELL_HEIGHT + CELL_SPACING));

        // Clamp
        const clampedCol = Math.max(0, Math.min(7 - 1, col));
        const clampedRow = Math.max(0, Math.min(numWeeks - 1, row));

        return { type: 'grid', col: clampedCol, row: clampedRow };
      },
      [data.length, PADDING_LEFT, PADDING_TOP, cellWidth, CELL_SPACING, CELL_HEIGHT, numWeeks],
    ),
    onInteractionChange: useCallback(
      (state: InteractionState) => {
        if (state.type === 'grid') {
          const point = pointMap.get(`${state.col}_${state.row}`);
          setSelectedPoint(point || null);
        } else if (state.type === 'none') {
          setSelectedPoint(null);
        }
      },
      [pointMap],
    ),
    enabled: data.length > 0,
  });

  return (
    <View
      style={{ height: totalHeight, width: CHART_WIDTH, overflow: 'visible' }}
      ref={chartRef}
      onLayout={onLayout}
      collapsable={false}
    >
      <View style={{ marginBottom: Spacing.sm }}>
        <AppText
          variant="caption"
          style={{
            color: theme.text,
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: 1.2,
            opacity: Opacity.strong,
          }}
        >
          {title}
        </AppText>
      </View>

      <GestureDetector gesture={gesture}>
        <View style={{ height: totalHeight, width: CHART_WIDTH }}>
          <Svg height={totalHeight} width={CHART_WIDTH} style={{ overflow: 'visible' }}>
            {/* Day Labels (X-Axis) */}
            {DAYS.map((d, i) => (
              <SvgText
                key={i}
                x={PADDING_LEFT + i * (cellWidth + CELL_SPACING) + cellWidth / 2}
                y={DAY_LABEL_HEIGHT}
                fontSize={10}
                fontWeight="800"
                fill={theme.text}
                opacity={Opacity.strong}
                textAnchor="middle"
              >
                {d}
              </SvgText>
            ))}

            {/* Weeks and Months */}
            {data.map((p, i) => {
              const x = PADDING_LEFT + p.x * (cellWidth + CELL_SPACING);
              const y = PADDING_TOP + p.y * (CELL_HEIGHT + CELL_SPACING);
              const opacity = getOpacity(p.value);
              const isSelected = selectedPoint === p;

              // Blend with surface to get a solid hex (instead of translucent opacity)
              const cellBackgroundColor = isSelected ? theme.text : blend(theme.primary, opacity);

              // Determine content color via contrast engine using the solid blended color
              // Opinionated flip: Only use dark text for high intensity (> 50%)
              const contentColor = isSelected
                ? theme.surface
                : opacity > 0.5
                  ? onContrast(cellBackgroundColor)
                  : theme.text;

              const contentOpacity = isSelected ? 1 : p.value === 0 ? 0.5 : 1;

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
                      opacity={Opacity.strong}
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
                    fill={cellBackgroundColor}
                  />
                  {p.label && (
                    <SvgText
                      x={x + cellWidth / 2}
                      y={y + CELL_HEIGHT / 2 + 3}
                      fontSize={8}
                      fontWeight="700"
                      fill={contentColor}
                      textAnchor="middle"
                      opacity={contentOpacity}
                      pointerEvents="none"
                    >
                      {p.label}
                    </SvgText>
                  )}
                </G>
              );
            })}

            {/* Legend - Positioned at the very bottom */}
            <SvgText
              x={CHART_WIDTH - 65}
              y={totalHeight - 25}
              fontSize={9}
              fill={theme.text}
              opacity={Opacity.medium}
              textAnchor="end"
            >
              Low
            </SvgText>
            {[0.2, 0.4, 0.6, 0.8, 1.0].map((level, i) => (
              <Rect
                key={i}
                x={CHART_WIDTH - 60 + i * 10}
                y={totalHeight - 33}
                width={8}
                height={8}
                rx={1.5}
                fill={theme.primary}
                opacity={0.15 + level * 0.85}
              />
            ))}
            <SvgText
              x={CHART_WIDTH}
              y={totalHeight - 25}
              fontSize={9}
              fill={theme.text}
              opacity={Opacity.medium}
              textAnchor="start"
            >
              High
            </SvgText>
          </Svg>
        </View>
      </GestureDetector>

      {selectedPoint && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 1000 }]} pointerEvents="box-none">
          {(() => {
            const x = PADDING_LEFT + selectedPoint.x * (cellWidth + CELL_SPACING) + cellWidth / 2;
            const y =
              PADDING_TOP + selectedPoint.y * (CELL_HEIGHT + CELL_SPACING) + CELL_HEIGHT / 2;

            return (
              <ChartTooltip
                x={x}
                y={y}
                containerWidth={CHART_WIDTH}
                containerHeight={totalHeight}
                tooltipWidth={tooltipWidth}
                tooltipHeight={tooltipHeight}
                offset={CELL_HEIGHT / 2 + 10}
                edgePadding={Spacing.sm}
                avoidPointVertical={true}
              >
                {renderTooltipContent ? (
                  renderTooltipContent(selectedPoint.x, selectedPoint.y)
                ) : (
                  <View style={{ width: 140 }}>
                    <View style={styles.tooltipHeader}>
                      <AppText
                        variant="caption"
                        style={{ fontWeight: '700', color: theme.textSecondary }}
                      >
                        {selectedPoint.timestamp
                          ? dayjs(selectedPoint.timestamp).format('MMM D, YYYY')
                          : `Day ${selectedPoint.label}`}
                      </AppText>

                      {onCellPress && (
                        <TouchableOpacity
                          style={[styles.viewButton, { backgroundColor: theme.primaryLight }]}
                          onPress={() => {
                            onCellPress(selectedPoint);
                            setSelectedPoint(null);
                          }}
                        >
                          <AppText
                            variant="caption"
                            style={{ color: theme.primary, fontWeight: '800', fontSize: 10 }}
                          >
                            VIEW
                          </AppText>
                        </TouchableOpacity>
                      )}
                    </View>

                    <MoneyText
                      amount={selectedPoint.value}
                      currencyCode={currency}
                      variant="title"
                      style={{ fontWeight: '800', color: theme.text, marginTop: 2 }}
                    />
                  </View>
                )}
              </ChartTooltip>
            );
          })()}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
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
  },
});
