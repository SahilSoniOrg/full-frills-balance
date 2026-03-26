import { useCallback } from 'react';

interface UseChartTooltipPositionParams {
    containerWidth: number;
    containerHeight: number;
    offset?: number;
    edgePadding?: number;
    avoidPointVertical?: boolean;
}

export function useChartTooltipPosition({
    containerWidth,
    containerHeight,
    offset = 15,
    edgePadding = 10,
    avoidPointVertical = false,
}: UseChartTooltipPositionParams) {
    return useCallback((x: number, y: number) => {
        const showOnRight = x < (containerWidth / 2);
        const showBelow = avoidPointVertical ? (y < containerHeight * 0.6) : false;

        return { 
            showOnRight, 
            showBelow,
            offset,
            edgePadding,
            containerWidth,
            containerHeight
        };
    }, [containerHeight, containerWidth, offset, edgePadding, avoidPointVertical]);
}

