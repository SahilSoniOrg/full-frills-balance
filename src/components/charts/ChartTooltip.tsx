import { Shape, Spacing } from '@/src/constants';
import { REPORT_CHART_COLORS, REPORT_CHART_LAYOUT } from '@/src/constants/report-constants';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { LayoutChangeEvent, View, ViewStyle } from 'react-native';

interface ChartTooltipProps {
  x: number;
  y: number;
  containerWidth: number;
  containerHeight: number;
  tooltipWidth?: number;
  tooltipHeight?: number;
  offset: number;
  edgePadding: number;
  avoidPointVertical?: boolean;
  centerOffset?: number;
  children: React.ReactNode;
}

/**
 * Unified tooltip container for all charts.
 * Handles positioning, measurement, and overflow management.
 */
export const ChartTooltip: React.FC<ChartTooltipProps> = ({
  x,
  y,
  containerWidth,
  containerHeight,
  tooltipWidth: propWidth = 120,
  tooltipHeight: propHeight = 60,
  offset,
  edgePadding,
  avoidPointVertical = false,
  centerOffset = 40,
  children,
}) => {
  const { theme } = useTheme();
  const [measuredSize, setMeasuredSize] = React.useState<{ width: number; height: number } | null>(
    null,
  );

  const onLayout = React.useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setMeasuredSize(prev => {
        // Only update if delta is significant (> 1px) to prevent layout loops
        const widthDiff = Math.abs((prev?.width ?? 0) - width);
        const heightDiff = Math.abs((prev?.height ?? 0) - height);
        if (widthDiff > 1 || heightDiff > 1) {
          return { width, height };
        }
        return prev;
      });
    }
  }, []);

  // Use measured size if available, otherwise fallback to prop-based estimates
  const tooltipWidth = measuredSize?.width ?? propWidth;
  const tooltipHeight = measuredSize?.height ?? propHeight;

  // 1. Decide horizontal orientation preference
  const spaceOnRight = containerWidth - x - offset - edgePadding;
  const spaceOnLeft = x - offset - edgePadding;

  const actualShowOnRight =
    x < containerWidth / 2
      ? spaceOnRight >= tooltipWidth || spaceOnRight > spaceOnLeft
      : spaceOnLeft < tooltipWidth && spaceOnRight > spaceOnLeft;

  // 2. Calculate initial horizontal position (Sideways preference)
  let sidewaysLeft: number;
  if (actualShowOnRight) {
    sidewaysLeft = x + offset;
  } else {
    sidewaysLeft = x - offset - tooltipWidth;
  }

  // 3. Detect horizontal overlap with the point
  const safeMargin = 30;
  const clampedSidewaysLeft = Math.max(
    edgePadding,
    Math.min(sidewaysLeft, containerWidth - tooltipWidth - edgePadding),
  );
  const overlapsX =
    clampedSidewaysLeft < x + safeMargin && clampedSidewaysLeft + tooltipWidth > x - safeMargin;

  // Use vertical avoidance if requested OR if horizontal space is so tight we overlap the point
  const shouldAvoidPointVertical = avoidPointVertical || overlapsX;

  // 4. Calculate final horizontal position
  let finalLeft: number;
  if (shouldAvoidPointVertical) {
    // Center alignment when above/below point
    const idealLeft = x - tooltipWidth / 2;
    finalLeft = Math.max(
      edgePadding,
      Math.min(idealLeft, containerWidth - tooltipWidth - edgePadding),
    );
  } else {
    // Side alignment
    finalLeft = clampedSidewaysLeft;
  }

  // 4. Decide vertical orientation
  const spaceAbove = y - offset - edgePadding;
  const spaceBelow = containerHeight - y - offset - edgePadding;

  let actualShowBelow = false;
  if (shouldAvoidPointVertical) {
    const fitsAbove = spaceAbove >= tooltipHeight;
    const fitsBelow = spaceBelow >= tooltipHeight;

    if (fitsAbove && !fitsBelow) {
      actualShowBelow = false;
    } else if (!fitsAbove && fitsBelow) {
      actualShowBelow = true;
    } else {
      // Both fit or neither fit? Pick the one with more room
      actualShowBelow = spaceBelow > spaceAbove;
    }
  }

  const containerStyle: ViewStyle = {
    position: 'absolute',
    pointerEvents: 'box-none',
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
      height: REPORT_CHART_LAYOUT.tooltipShadowOffsetY,
    },
    shadowOpacity: REPORT_CHART_LAYOUT.tooltipShadowOpacity,
    shadowRadius: REPORT_CHART_LAYOUT.tooltipShadowRadius,
    left: finalLeft,
  };

  // 5. Apply final vertical position
  if (shouldAvoidPointVertical) {
    // Relaxed vertical clamping: allow overflow to clear the point
    const verticalBoundaryRelaxation = 200;
    if (actualShowBelow) {
      const idealTop = y + offset;
      containerStyle.top = Math.max(
        idealTop,
        Math.min(idealTop, containerHeight + verticalBoundaryRelaxation - tooltipHeight),
      );
    } else {
      const idealTop = y - offset - tooltipHeight;
      containerStyle.top = Math.min(idealTop, Math.max(-verticalBoundaryRelaxation, idealTop));
    }
  } else {
    const idealTop = y - centerOffset;
    containerStyle.top = Math.max(
      edgePadding,
      Math.min(idealTop, containerHeight - tooltipHeight - edgePadding),
    );
  }

  return (
    <View onLayout={onLayout} style={containerStyle}>
      {children}
    </View>
  );
};
