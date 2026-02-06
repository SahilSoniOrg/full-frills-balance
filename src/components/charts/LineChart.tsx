
import { AppText } from '@/src/components/core';
import { Layout, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React, { useMemo } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

interface DataPoint {
    x: number; // timestamp
    y: number; // value
}

interface LineChartProps {
    data: DataPoint[];
    height?: number;
    color?: string;
    showGradient?: boolean;
}

export const LineChart = ({ data, height = Layout.chart.line.defaultHeight, color, showGradient = true }: LineChartProps) => {
    const { theme } = useTheme();
    const chartColor = color || theme.primary;
    const { width } = Dimensions.get('window');
    const CHART_WIDTH = width - (Spacing.lg * 2); // Padding
    const PADDING_VERTICAL = Layout.chart.line.paddingVertical;

    const { path, gradientPath } = useMemo(() => {
        if (data.length === 0) return { path: "", gradientPath: "" };

        const yValues = data.map(d => d.y);
        const xValues = data.map(d => d.x);

        const minX = Math.min(...xValues);
        const maxX = Math.max(...xValues);
        const minY = Math.min(...yValues);
        const maxY = Math.max(...yValues);

        // Add some padding to Y range
        const yRange = maxY - minY || 1;
        const displayMinY = minY - (yRange * 0.1);
        const displayMaxY = maxY + (yRange * 0.1);
        const displayRange = displayMaxY - displayMinY;

        let pathStr = "";
        let gradientPathStr = "";

        data.forEach((point, index) => {
            const x = ((point.x - minX) / (maxX - minX)) * CHART_WIDTH;
            // Invert Y because SVG 0 is top
            const y = height - PADDING_VERTICAL - (((point.y - displayMinY) / displayRange) * (height - (PADDING_VERTICAL * 2)));

            if (index === 0) {
                pathStr += `M ${x} ${y}`;
                gradientPathStr += `M ${x} ${height} L ${x} ${y}`;
            } else {
                pathStr += ` L ${x} ${y}`;
                gradientPathStr += ` L ${x} ${y}`;
            }
        });

        // Close gradient path
        if (data.length > 0) {
            gradientPathStr += ` L ${CHART_WIDTH} ${height} L 0 ${height} Z`;
        }

        return { path: pathStr, gradientPath: gradientPathStr };
    }, [data, height, CHART_WIDTH]);

    if (data.length === 0) {
        return (
            <View style={[styles.container, { height, borderColor: theme.border, borderWidth: 1, justifyContent: 'center', alignItems: 'center' }]}>
                <AppText color="secondary">No data available</AppText>
            </View>
        );
    }

    return (
        <View style={{ height }}>
            <Svg height={height} width={CHART_WIDTH}>
                <Defs>
                    <LinearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={chartColor} stopOpacity="0.5" />
                        <Stop offset="1" stopColor={chartColor} stopOpacity="0" />
                    </LinearGradient>
                </Defs>
                {showGradient && (
                    <Path
                        d={gradientPath}
                        fill="url(#gradient)"
                    />
                )}
                <Path
                    d={path}
                    stroke={chartColor}
                    strokeWidth={3}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </Svg>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        borderRadius: 16,
        overflow: 'hidden',
    }
});
