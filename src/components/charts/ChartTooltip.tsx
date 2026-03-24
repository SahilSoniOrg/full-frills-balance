import { Shape, Spacing } from '@/src/constants';
import { REPORT_CHART_LAYOUT } from '@/src/constants/report-constants';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';

interface ChartTooltipProps extends ViewProps {
    children: React.ReactNode;
}

export const ChartTooltip = ({ children, style, ...props }: ChartTooltipProps) => {
    const { theme } = useTheme();

    return (
        <View 
            style={[
                styles.tooltip, 
                { 
                    backgroundColor: theme.surface, 
                    borderColor: theme.border 
                }, 
                style
            ]} 
            {...props}
        >
            {children}
        </View>
    );
};

const styles = StyleSheet.create({
    tooltip: {
        borderRadius: Shape.radius.md,
        padding: Spacing.sm,
        borderWidth: 1,
        shadowColor: '#000', // Hardcoded shadow color is fine as per report-constants but could be tokenized later
        shadowOffset: { 
            width: REPORT_CHART_LAYOUT.tooltipShadowOffsetX, 
            height: REPORT_CHART_LAYOUT.tooltipShadowOffsetY 
        },
        shadowOpacity: REPORT_CHART_LAYOUT.tooltipShadowOpacity,
        shadowRadius: REPORT_CHART_LAYOUT.tooltipShadowRadius,
        elevation: REPORT_CHART_LAYOUT.tooltipElevation,
        zIndex: REPORT_CHART_LAYOUT.tooltipZIndex,
    },
});
