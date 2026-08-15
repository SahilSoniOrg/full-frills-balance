import { AppConfig } from '@/src/constants/app-config';
import { REPORT_CHART_LAYOUT } from '@/src/constants/report-constants';
import { useMoneyFormat } from '@/src/components/common/moneyFormat';
import type { DataPoint, HorizontalLine } from './chartMath';
import React from 'react';
import { Circle, Line, Text as SvgText } from 'react-native-svg';

export interface LineChartGridProps {
  displayMinY: number;
  displayRange: number;
  minX: number;
  maxX: number;
  height: number;
  chartWidth: number;
  plotWidth: number;
  paddingLeft: number;
  paddingRight: number;
  paddingVertical: number;
  currencyCode: string;
  theme: {
    border: string;
    textSecondary: string;
    surface: string;
  };
  chartColor: string;
  xTicks?: number[];
  formatXTick?: (x: number) => string;
  todayX?: number;
  todayDataPoint?: DataPoint;
  extraHorizontalLines?: HorizontalLine[];
  maxValPoint?: DataPoint;
}

export const LineChartGrid = React.memo(function LineChartGrid({
  displayMinY,
  displayRange,
  minX,
  maxX,
  height,
  chartWidth,
  plotWidth,
  paddingLeft,
  paddingRight,
  paddingVertical,
  currencyCode,
  theme,
  chartColor,
  xTicks,
  formatXTick,
  todayX,
  todayDataPoint,
  extraHorizontalLines,
  maxValPoint,
}: LineChartGridProps) {
  const formatMoneyShort = useMoneyFormat({ style: 'short' });

  return (
    <>
      {/* Y-Axis Grid Lines & Ticks */}
      {REPORT_CHART_LAYOUT.lineChartTicks.map(t => {
        const val = displayMinY + t * displayRange;
        const y = height - paddingVertical - t * (height - paddingVertical * 2);
        return (
          <React.Fragment key={t}>
            <Line
              x1={paddingLeft}
              y1={y}
              x2={chartWidth - paddingRight}
              y2={y}
              stroke={theme.border}
              strokeWidth={1}
              strokeDasharray="4,4"
              opacity={REPORT_CHART_LAYOUT.lineChartGridOpacity}
            />
            <SvgText
              x={paddingLeft - REPORT_CHART_LAYOUT.lineChartYLabelOffsetX}
              y={y + REPORT_CHART_LAYOUT.lineChartYLabelOffsetY}
              fontSize={REPORT_CHART_LAYOUT.lineChartYLabelFontSize}
              fill={theme.textSecondary}
              textAnchor="end"
            >
              {formatMoneyShort(val, currencyCode)}
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
          const x = paddingLeft + normalizedX * plotWidth;
          return (
            <React.Fragment key={`xtick-${i}`}>
              <Line
                x1={x}
                y1={paddingVertical}
                x2={x}
                y2={height - Math.max(0, paddingVertical - 5)}
                stroke={theme.border}
                strokeWidth={1}
                strokeDasharray="4,4"
                opacity={REPORT_CHART_LAYOUT.lineChartGridOpacity}
              />
              <SvgText
                x={x}
                y={height - Math.max(0, paddingVertical - 20)}
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
          const x = paddingLeft + normalizedX * plotWidth;
          return (
            <React.Fragment>
              <Line
                x1={x}
                y1={paddingVertical}
                x2={x}
                y2={height - paddingVertical}
                stroke={theme.textSecondary}
                strokeWidth={1.5}
                opacity={0.6}
              />
              <SvgText
                x={x + 4}
                y={paddingVertical + 10}
                fontSize={REPORT_CHART_LAYOUT.lineChartMaxLabelFontSize}
                fill={theme.textSecondary}
                textAnchor="start"
                opacity={0.8}
              >
                {AppConfig.strings.reports.today}
              </SvgText>
              {todayDataPoint &&
                (() => {
                  const y =
                    height -
                    paddingVertical -
                    ((todayDataPoint.y - displayMinY) / displayRange) *
                      (height - paddingVertical * 2);

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
                        {formatMoneyShort(todayDataPoint.y, currencyCode)}
                      </SvgText>
                    </React.Fragment>
                  );
                })()}
            </React.Fragment>
          );
        })()}

      {/* Extra Horizontal Reference Lines */}
      {extraHorizontalLines?.map((line, i) => {
        if (line.value < displayMinY || line.value > displayMinY + displayRange) return null;
        const y =
          height -
          paddingVertical -
          ((line.value - displayMinY) / displayRange) * (height - paddingVertical * 2);
        const lineColor = line.color || theme.textSecondary;

        return (
          <React.Fragment key={`extra-h-${i}`}>
            <Line
              x1={paddingLeft}
              y1={y}
              x2={chartWidth - paddingRight}
              y2={y}
              stroke={lineColor}
              strokeWidth={1}
              strokeDasharray={line.strokeDasharray || '4,4'}
              opacity={0.8}
            />
            {line.label && (
              <SvgText
                x={chartWidth - paddingRight - 4}
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
          const x = paddingLeft + normalizedX * plotWidth;
          const y =
            height -
            paddingVertical -
            ((maxValPoint.y - displayMinY) / displayRange) * (height - paddingVertical * 2);
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
                {AppConfig.strings.reports.maxLabel}
              </SvgText>
            </React.Fragment>
          );
        })()}
    </>
  );
});
