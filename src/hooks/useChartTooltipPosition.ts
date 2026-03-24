import { useCallback } from 'react';

interface UseChartTooltipPositionParams {
    containerWidth: number;
    containerHeight: number;
    tooltipWidth: number;
    tooltipHeight: number;
    offset?: number;
    edgePadding?: number;
}

export function useChartTooltipPosition({
    containerWidth,
    containerHeight,
    tooltipWidth,
    tooltipHeight,
    offset = 15,
    edgePadding = 10,
}: UseChartTooltipPositionParams) {
    return useCallback((x: number, y: number) => {
        const showOnRight = x < (containerWidth / 2);
        let left = showOnRight ? x + offset : x - tooltipWidth - offset;

        if (left < 0) left = edgePadding;
        if (left + tooltipWidth > containerWidth) {
            left = containerWidth - tooltipWidth - edgePadding;
        }

        let top = y - (tooltipHeight / 2);
        if (top < edgePadding) top = edgePadding;
        if (top + tooltipHeight > containerHeight - edgePadding) {
            top = containerHeight - tooltipHeight - edgePadding;
        }

        return { left, top };
    }, [containerHeight, containerWidth, edgePadding, offset, tooltipHeight, tooltipWidth]);
}
