import { AppText } from '@/src/components/core';
import { Layout } from '@/src/constants';
import { REPORT_CHART_LAYOUT, REPORT_CHART_STRINGS } from '@/src/constants/report-constants';
import { resolveThemeColor } from '@/src/design-system/utils';
import { useTheme } from '@/src/hooks/use-theme';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

interface DonutData {
  value: number;
  color: string;
  label?: string;
}

interface DonutChartProps {
  data: DonutData[];
  size?: number;
  strokeWidth?: number;
}

// Helper to calculate SVG Arc path
const createArc = (x: number, y: number, r: number, startAngle: number, endAngle: number) => {
  // Convert degrees to radians and offset by -90 (so 0 is top)
  const startRad = ((startAngle - 90) * Math.PI) / 180.0;
  const endRad = ((endAngle - 90) * Math.PI) / 180.0;

  const x1 = x + r * Math.cos(startRad);
  const y1 = y + r * Math.sin(startRad);
  const x2 = x + r * Math.cos(endRad);
  const y2 = y + r * Math.sin(endRad);

  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

  return ['M', x1, y1, 'A', r, r, 0, largeArcFlag, 1, x2, y2].join(' ');
};

export const DonutChart = ({
  data,
  size = Layout.chart.donut.defaultSize,
  strokeWidth = Layout.chart.donut.defaultStrokeWidth,
}: DonutChartProps) => {
  const { theme } = useTheme();
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;

  const paths = useMemo(() => {
    const positiveData = data.filter(item => item.value > 0);
    const total = positiveData.reduce((sum, d) => sum + d.value, 0);
    if (total <= 0) {
      return [];
    }

    const isSingleSegment = positiveData.length === 1;
    let startAngle = 0;

    return positiveData.map(item => {
      const angle = (item.value / total) * 360;
      const isFullCircle =
        isSingleSegment && Math.abs(angle - 360) <= REPORT_CHART_LAYOUT.donutFullCircleAngleEpsilon;

      const pathData = createArc(center, center, radius, startAngle, startAngle + angle);

      const segment = {
        path: pathData,
        color: resolveThemeColor(theme, item.color) || theme.primary,
        isFullCircle: isFullCircle,
      };

      startAngle += angle;
      return segment;
    });
  }, [data, radius, center, theme]);

  if (paths.length === 0) {
    return (
      <View
        style={[
          styles.container,
          {
            height: size,
            width: size,
            borderColor: theme.border,
            borderWidth: 1,
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: size / 2,
          },
        ]}
      >
        <AppText color="secondary">{REPORT_CHART_STRINGS.chartNoData}</AppText>
      </View>
    );
  }

  return (
    <View style={{ width: size, height: size }}>
      <Svg height={size} width={size}>
        {paths.map((p, i) =>
          p.isFullCircle ? (
            <Circle
              key={i}
              cx={center}
              cy={center}
              r={radius}
              stroke={p.color}
              strokeWidth={strokeWidth}
              fill="none"
            />
          ) : (
            <Path
              key={i}
              d={p.path}
              stroke={p.color}
              strokeWidth={strokeWidth}
              fill="none"
              strokeLinecap="round"
            />
          ),
        )}
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});
