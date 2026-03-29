import { AppText } from '@/src/components/core';
import { Shape } from '@/src/constants';
import { Box } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, StyleSheet, TouchableOpacity } from 'react-native';

export type SegmentedOption = {
  id: string;
  label: string;
};

interface AppSegmentedControlProps {
  options: readonly SegmentedOption[] | SegmentedOption[];
  value: string;
  onChange: (id: any) => void;
  minWidth?: number;
  flex?: boolean;
  size?: 'sm' | 'md';
  trackColor?: string;
  pillColor?: string;
  activeTextColor?: string;
  inactiveTextColor?: string;
}

/**
 * AppSegmentedControl - A premium, animated segmented control (pill selector)
 * Features a sliding background animation for smooth transitions between options.
 */
export const AppSegmentedControl = ({
  options,
  value,
  onChange,
  minWidth = 64,
  flex = false,
  size = 'md',
  trackColor,
  pillColor,
  activeTextColor,
  inactiveTextColor,
}: AppSegmentedControlProps) => {
  const { theme } = useTheme();
  const [containerWidth, setContainerWidth] = useState(0);

  // Find index of current value
  const selectedIndex = options.findIndex((opt: SegmentedOption) => opt.id === value);
  const safeIndex = selectedIndex === -1 ? 0 : selectedIndex;

  // Initialize with safeIndex to avoid animation on first mount
  const scrollValue = useRef(new Animated.Value(safeIndex)).current;

  useEffect(() => {
    // If the component hasn't been laid out yet, snap to the current value without animation.
    // This allows the initial position to be correct when the pill finally renders.
    if (containerWidth === 0) {
      scrollValue.setValue(safeIndex);
      return;
    }

    Animated.spring(scrollValue, {
      toValue: safeIndex,
      useNativeDriver: true,
      friction: 10,
      tension: 60,
    }).start();
  }, [safeIndex, containerWidth, scrollValue]);

  const onContainerLayout = (event: LayoutChangeEvent) => {
    setContainerWidth(event.nativeEvent.layout.width);
  };

  const contentWidth = Math.max(0, containerWidth - 8); // 2 * Spacing.xs (padding)
  const itemWidth = contentWidth / options.length;
  const isSmall = size === 'sm';

  const translateX = scrollValue.interpolate({
    inputRange: options.map((_, i: number) => i),
    outputRange: options.map((_, i: number) => i * itemWidth),
  });

  return (
    <Box
      background="surfaceSecondary"
      borderRadius="full"
      padding="xs"
      onLayout={onContainerLayout}
      style={[
        styles.container,
        isSmall && styles.containerSm,
        { backgroundColor: trackColor || theme.surfaceSecondary },
        flex ? { width: '100%' } : { alignSelf: 'flex-start' },
      ]}
    >
      {containerWidth > 0 && (
        <Animated.View
          style={[
            styles.pill,
            {
              width: itemWidth,
              backgroundColor: pillColor || theme.primary,
              transform: [{ translateX }],
            },
            isSmall && styles.pillSm,
          ]}
        />
      )}
      <Box flexDirection="row">
        {options.map((option: SegmentedOption) => {
          const isSelected = option.id === value;
          return (
            <TouchableOpacity
              key={option.id}
              onPress={() => onChange(option.id)}
              activeOpacity={0.7}
              style={[
                styles.option,
                isSmall && styles.optionSm,
                flex ? { flex: 1 } : { width: minWidth },
              ]}
            >
              <AppText
                variant="caption"
                weight={isSelected ? 'semibold' : 'medium'}
                style={{
                  color: isSelected
                    ? (activeTextColor || theme.onPrimary)
                    : (inactiveTextColor || theme.textSecondary),
                  textAlign: 'center',
                }}
              >
                {option.label}
              </AppText>
            </TouchableOpacity>
          );
        })}
      </Box>
    </Box>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    minHeight: 32,
  },
  containerSm: {
    minHeight: 28,
  },
  pill: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    borderRadius: Shape.radius.full,
    zIndex: 0,
  },
  pillSm: {
    top: 3,
    bottom: 3,
    left: 3,
  },
  option: {
    paddingVertical: 6,
    zIndex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionSm: {
    paddingVertical: 4,
  },
});
