import { REPORT_CHART_LAYOUT } from '@/src/constants/report-constants';
import type { DataPoint } from './chartMath';
import React from 'react';
import { Circle, Path } from 'react-native-svg';

export interface LineChartSeriesProps {
  data: DataPoint[];
  path: string;
  secondaryPath: string;
  gradientPath: string;
  showGradient: boolean;
  chartColor: string;
  secondaryColor?: string;
  activeIndex?: number;
  minX: number;
  maxX: number;
  displayMinY: number;
  displayRange: number;
  height: number;
  plotWidth: number;
  paddingLeft: number;
  paddingVertical: number;
  surfaceColor: string;
}

export const LineChartSeries = React.memo(function LineChartSeries({
  data,
  path,
  secondaryPath,
  gradientPath,
  showGradient,
  chartColor,
  secondaryColor,
  activeIndex,
  minX,
  maxX,
  displayMinY,
  displayRange,
  height,
  plotWidth,
  paddingLeft,
  paddingVertical,
  surfaceColor,
}: LineChartSeriesProps) {
  const isSelected = activeIndex !== undefined && activeIndex !== -1;

  return (
    <>
      {showGradient && <Path d={gradientPath} fill="url(#gradient)" />}

      <Path
        d={path}
        stroke={chartColor}
        strokeWidth={REPORT_CHART_LAYOUT.lineChartSeriesStrokeWidth}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={isSelected ? REPORT_CHART_LAYOUT.lineChartSelectedSeriesOpacity : 1}
      />

      {secondaryPath ? (
        <Path
          d={secondaryPath}
          stroke={secondaryColor}
          strokeWidth={REPORT_CHART_LAYOUT.lineChartSeriesStrokeWidth}
          fill="none"
          opacity={0.7}
        />
      ) : null}

      {/* Interactive Selected Point and Vertical Indicator */}
      {data.map((point, index) => {
        const pointSelected = activeIndex === index;
        if (!pointSelected) return null;

        const normalizedX = maxX === minX ? 0.5 : (point.x - minX) / (maxX - minX);
        const x = paddingLeft + normalizedX * plotWidth;
        const y =
          height -
          paddingVertical -
          ((point.y - displayMinY) / displayRange) * (height - paddingVertical * 2);

        return (
          <React.Fragment key={index}>
            <Circle
              cx={x}
              cy={y}
              r={REPORT_CHART_LAYOUT.lineChartSelectedPointRadius}
              fill={chartColor}
              stroke={surfaceColor}
              strokeWidth={REPORT_CHART_LAYOUT.lineChartSelectedPointStrokeWidth}
            />
            <Path
              d={`M ${x} ${height - paddingVertical} L ${x} ${y + REPORT_CHART_LAYOUT.lineChartSelectedIndicatorOffsetY}`}
              stroke={chartColor}
              strokeWidth={REPORT_CHART_LAYOUT.lineChartSelectedIndicatorStrokeWidth}
              strokeDasharray="4,4"
              opacity={REPORT_CHART_LAYOUT.lineChartSelectedSeriesOpacity}
            />
          </React.Fragment>
        );
      })}
    </>
  );
});
