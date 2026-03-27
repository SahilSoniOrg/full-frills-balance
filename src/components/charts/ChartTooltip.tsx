import { Shape, Spacing } from '@/src/constants';
import { REPORT_CHART_LAYOUT, REPORT_CHART_COLORS } from '@/src/constants/report-constants';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { View, ViewStyle } from 'react-native';

interface ChartTooltipProps {
    x: number;
    y: number;
    containerWidth: number;
    containerHeight: number;
    showOnRight: boolean;
    showBelow: boolean;
    offset: number;
    edgePadding: number;
    avoidPointVertical?: boolean;
    centerOffset?: number;
    children: React.ReactNode;
}

/**
 * Unified tooltip container for all charts.
 * Handles positioning, overflow management, and consistent styling.
 */
export const ChartTooltip: React.FC<ChartTooltipProps> = ({
    x,
    y,
    containerWidth,
    containerHeight,
    showOnRight,
    showBelow,
    offset,
    edgePadding,
    avoidPointVertical = false,
    centerOffset = 40,
    children
}) => {
    const { theme } = useTheme();

    const containerStyle: ViewStyle = {
        position: 'absolute',
        pointerEvents: 'none',
        zIndex: REPORT_CHART_LAYOUT.tooltipZIndex,
        elevation: REPORT_CHART_LAYOUT.tooltipElevation,
        backgroundColor: theme.surface,
        borderRadius: Shape.radius.md,
        padding: Spacing.sm,
        borderWidth: 1,
        borderColor: theme.border,
        shadowColor: REPORT_CHART_COLORS.tooltipShadow,
        shadowOffset: {
            width: REPORT_CHART_LAYOUT.tooltipShadowOffsetX,
            height: REPORT_CHART_LAYOUT.tooltipShadowOffsetY
        },
        shadowOpacity: REPORT_CHART_LAYOUT.tooltipShadowOpacity,
        shadowRadius: REPORT_CHART_LAYOUT.tooltipShadowRadius,
    };

    if (showOnRight) {
        containerStyle.left = x + offset;
        containerStyle.maxWidth = containerWidth - x - offset - edgePadding;
    } else {
        // Anchor to right to grow left
        containerStyle.right = (containerWidth - x) + offset;
        containerStyle.maxWidth = x - offset - edgePadding;
    }

    if (avoidPointVertical) {
        if (showBelow) {
            containerStyle.top = y + offset;
        } else {
            // Anchor to bottom to grow up
            containerStyle.bottom = (containerHeight - y) + offset;
        }
    } else {
        containerStyle.top = y - centerOffset; // Default center-ish
    }

    return (
        <View style={containerStyle}>
            {children}
        </View>
    );
};
