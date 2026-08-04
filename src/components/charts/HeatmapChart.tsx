import { AppText } from '@/src/components/core';
import { AppConfig, Spacing } from '@/src/constants';
import { REPORT_CHART_LAYOUT } from '@/src/constants/report-constants';
import { useTheme } from '@/src/hooks/use-theme';
import { InteractionState, useChartInteraction } from '@/src/hooks/useChartInteraction';
import { HeatmapPoint } from '@/src/services/reports/reportSnapshot';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import React, { useCallback, useMemo, useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Svg, { G, Rect, Text as SvgText } from 'react-native-svg';
import { ChartTooltip } from './ChartTooltip';

interface HeatmapChartProps {
  data: HeatmapPoint[];
  height?: number;
  width?: number;
  currency: string;
  renderTooltipContent?: (col: number, row: number) => React.ReactNode;
  tooltipWidth?: number;
  tooltipHeight?: number;
  hideLabels?: boolean;
}

export const HeatmapChart: React.FC<HeatmapChartProps> = ({
  data,
  height = REPORT_CHART_LAYOUT.heatmapDefaultHeight,
  width: customWidth,
  currency,
  renderTooltipContent,
  tooltipWidth,
  tooltipHeight,
  hideLabels,
}) => {
  const { theme, blend } = useTheme();
  const [selectedPoint, setSelectedPoint] = useState<HeatmapPoint | null>(null);
  const windowWidth = Dimensions.get('window').width;
  const CHART_WIDTH = customWidth || windowWidth - Spacing.lg * 2;

  const HOURS_DETAILED = [
    '12a',
    '2a',
    '4a',
    '6a',
    '8a',
    '10a',
    '12p',
    '2p',
    '4p',
    '6p',
    '8p',
    '10p',
  ];
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

  const pointMap = useMemo(() => {
    const map = new Map<string, HeatmapPoint>();
    data.forEach(p => map.set(`${p.x}_${p.y}`, p));
    return map;
  }, [data]);

  const getOpacity = (value: number) => {
    if (value === 0) return 0.03;
    return 0.12 + (Math.sqrt(value) / Math.sqrt(maxValue)) * 0.88;
  };

  const { chartRef, onLayout, gesture } = useChartInteraction({
    gestureConfig: {
      type: 'simultaneous',
    },
    getInteractionFromTouch: useCallback(
      (x: number, y: number) => {
        if (data.length === 0) return { type: 'none' };
        const col = Math.floor((x - PADDING_LEFT) / cellWidth);
        const row = Math.floor((y - PADDING_TOP) / cellHeight);

        // Clamp
        const clampedCol = Math.max(0, Math.min(7 - 1, col));
        const clampedRow = Math.max(0, Math.min(24 - 1, row));

        return { type: 'grid', col: clampedCol, row: clampedRow };
      },
      [data.length, PADDING_LEFT, PADDING_TOP, cellWidth, cellHeight],
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
      style={{ height, width: CHART_WIDTH, overflow: 'visible' }}
      ref={chartRef}
      onLayout={onLayout}
      collapsable={false}
    >
      <GestureDetector gesture={gesture}>
        <View style={{ height, width: CHART_WIDTH }}>
          <Svg height={height} width={CHART_WIDTH} style={{ overflow: 'visible' }}>
            {/* Y-Axis Labels (Hours) */}
            {HOURS_DETAILED.map((h, i) => {
              const hour = i * 2;
              const y = PADDING_TOP + hour * cellHeight + cellHeight / 2;
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
              const x = PADDING_LEFT + i * cellWidth + cellWidth / 2;
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
              const x = PADDING_LEFT + p.x * cellWidth;
              const y = PADDING_TOP + p.y * cellHeight;
              const opacity = getOpacity(p.value);
              const isSelected = selectedPoint?.x === p.x && selectedPoint?.y === p.y;
              const cellColor = isSelected ? theme.text : blend(theme.primary, opacity);

              return (
                <G key={i}>
                  <Rect
                    x={x + CELL_SPACING}
                    y={y + CELL_SPACING}
                    width={cellWidth - CELL_SPACING * 2}
                    height={cellHeight - CELL_SPACING * 2}
                    rx={1.5}
                    fill={cellColor}
                  />
                </G>
              );
            })}

            {/* Legend - Centered at bottom */}
            <SvgText
              x={PADDING_LEFT}
              y={height - 10}
              fontSize={8}
              fill={theme.text}
              opacity={0.6}
              textAnchor="start"
            >
              Less Activity
            </SvgText>
            {[0.2, 0.4, 0.6, 0.8, 1.0].map((level, i) => (
              <Rect
                key={i}
                x={CHART_WIDTH / 2 - 20 + i * 10}
                y={height - 16}
                width={8}
                height={8}
                rx={1.5}
                fill={blend(theme.primary, 0.12 + level * 0.88)}
              />
            ))}
            <SvgText
              x={CHART_WIDTH - 10}
              y={height - 10}
              fontSize={8}
              fill={theme.text}
              opacity={0.6}
              textAnchor="end"
            >
              More
            </SvgText>
          </Svg>
        </View>
      </GestureDetector>

      {selectedPoint && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 1000 }]} pointerEvents="box-none">
          {(() => {
            const x = PADDING_LEFT + selectedPoint.x * cellWidth + cellWidth / 2;
            const y = PADDING_TOP + selectedPoint.y * cellHeight + cellHeight / 2;
            return (
              <ChartTooltip
                x={x}
                y={y}
                containerWidth={CHART_WIDTH}
                containerHeight={height}
                tooltipWidth={tooltipWidth}
                tooltipHeight={tooltipHeight}
                offset={cellHeight / 2 + 10}
                edgePadding={Spacing.sm}
                avoidPointVertical={true}
              >
                {renderTooltipContent ? (
                  renderTooltipContent(selectedPoint.x, selectedPoint.y)
                ) : (
                  <View style={{ width: 120 }}>
                    <View style={styles.tooltipHeader}>
                      <AppText
                        variant="caption"
                        style={{ fontWeight: '700', color: theme.textSecondary }}
                      >
                        {DAYS_SHORT[selectedPoint.x]} • {selectedPoint.y}:00
                      </AppText>
                    </View>
                    <AppText
                      variant="title"
                      style={{ fontWeight: '800', color: theme.text, marginTop: 2 }}
                    >
                      {hideLabels
                        ? AppConfig.privacyMask
                        : CurrencyFormatter.formatAmount(selectedPoint.value, currency)}
                    </AppText>
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
    marginBottom: 2,
  },
});
