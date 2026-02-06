
import { AppText } from '@/src/components/core';
import { UIConstants } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

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
    const startRad = (startAngle - 90) * Math.PI / 180.0;
    const endRad = (endAngle - 90) * Math.PI / 180.0;

    const x1 = x + r * Math.cos(startRad);
    const y1 = y + r * Math.sin(startRad);
    const x2 = x + r * Math.cos(endRad);
    const y2 = y + r * Math.sin(endRad);

    const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

    return [
        "M", x1, y1,
        "A", r, r, 0, largeArcFlag, 1, x2, y2
    ].join(" ");
};

export const DonutChart = ({ data, size = UIConstants.chart.donut.defaultSize, strokeWidth = UIConstants.chart.donut.defaultStrokeWidth }: DonutChartProps) => {
    const { theme } = useTheme();
    const radius = (size - strokeWidth) / 2;
    const center = size / 2;

    const paths = useMemo(() => {
        const total = data.reduce((sum, d) => sum + d.value, 0);
        let startAngle = 0;

        return data.map(item => {
            const angle = (item.value / total) * 360;
            const pathData = createArc(center, center, radius, startAngle, startAngle + angle);

            startAngle += angle;
            return { path: pathData, color: item.color };
        });
    }, [data, radius, center]);

    if (data.length === 0) {
        return (
            <View style={[styles.container, { height: size, width: size, borderColor: theme.border, borderWidth: 1, justifyContent: 'center', alignItems: 'center', borderRadius: size / 2 }]}>
                <AppText color="secondary">No data</AppText>
            </View>
        );
    }

    return (
        <View style={{ width: size, height: size }}>
            <Svg height={size} width={size}>
                {paths.map((p, i) => (
                    <Path
                        key={i}
                        d={p.path}
                        stroke={p.color}
                        strokeWidth={strokeWidth}
                        fill="none"
                        strokeLinecap="round"
                    />
                ))}
            </Svg>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        overflow: 'hidden',
    }
});
