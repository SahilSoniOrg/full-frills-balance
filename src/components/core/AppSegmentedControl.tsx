import { Opacity, Shape, Spacing } from '@/src/constants';
import { Box } from '@/src/design-system/Box';
import { resolveThemeColor } from '@/src/design-system/utils';
import { useTheme } from '@/src/hooks/use-theme';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  LayoutChangeEvent,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { AppIcon, type IconName } from './AppIcon';
import { AppText } from './AppText';

export type SegmentedOption<T extends string | number = string> = {
  id: T;
  label: string;
  icon?: IconName;
};

interface AppSegmentedControlProps<T extends string | number> {
  options: readonly SegmentedOption<T>[] | SegmentedOption<T>[];
  value: T;
  onChange: (id: T) => void;
  minWidth?: number;
  flex?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'minimal';
  scrollable?: boolean;
  itemWidth?: number;
  trackColor?: string;
  pillColor?: string;
  activeTextColor?: string;
  inactiveTextColor?: string;
}

/**
 * AppSegmentedControl - A premium, animated segmented control (pill selector)
 * Features a sliding background animation for smooth transitions between options.
 */
export const AppSegmentedControl = <T extends string | number>({
  options,
  value,
  onChange,
  flex = false,
  size = 'md',
  variant = 'default',
  scrollable = false,
  itemWidth: propItemWidth,
  trackColor,
  pillColor,
  activeTextColor,
  inactiveTextColor,
}: AppSegmentedControlProps<T>) => {
  const { theme } = useTheme();
  const scrollViewRef = useRef<ScrollView>(null);
  const isMinimal = variant === 'minimal';

  const resolvedTrackColor = resolveThemeColor(
    theme,
    trackColor || (isMinimal ? 'transparent' : theme.surfaceSecondary),
  );
  const resolvedPillColor = resolveThemeColor(
    theme,
    pillColor || (isMinimal ? theme.primary : theme.primary),
  );
  const resolvedActiveTextColor = resolveThemeColor(
    theme,
    activeTextColor || (isMinimal ? theme.onPrimary : theme.onPrimary),
  );
  const resolvedInactiveTextColor = resolveThemeColor(
    theme,
    inactiveTextColor || theme.textSecondary,
  );
  const [containerWidth, setContainerWidth] = useState(0);
  const isSmall = size === 'sm';
  const isLarge = size === 'lg';
  const pillInset = isSmall ? 3 : isLarge ? 3 : 2;

  // Find index of current value
  const selectedIndex = options.findIndex(opt => opt.id === value);
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

  const effectivePillInset = isMinimal ? 0 : pillInset;

  const finalItemWidth = scrollable
    ? propItemWidth || (isSmall ? 44 : 64)
    : Math.max(0, containerWidth - effectivePillInset * 2) / options.length;

  const contentWidth = scrollable
    ? finalItemWidth * options.length
    : Math.max(0, containerWidth - effectivePillInset * 2);

  useEffect(() => {
    if (scrollable && scrollViewRef.current && safeIndex >= 0 && containerWidth > 0) {
      const scrollPos = safeIndex * finalItemWidth - containerWidth / 2 + finalItemWidth / 2;
      scrollViewRef.current.scrollTo({ x: Math.max(0, scrollPos), animated: true });
    }
  }, [safeIndex, scrollable, containerWidth, finalItemWidth]);

  const translateX = scrollValue.interpolate({
    inputRange: options.map((_, i: number) => i),
    outputRange: options.map((_, i: number) => i * finalItemWidth),
  });

  const renderContent = () => (
    <View style={{ width: scrollable ? contentWidth : '100%', flexDirection: 'row' }}>
      {options.length > 0 && (
        <Animated.View
          style={[
            styles.pill,
            {
              width: finalItemWidth,
              backgroundColor: resolvedPillColor,
              top: isMinimal ? 0 : pillInset,
              bottom: isMinimal ? 0 : pillInset,
              left: effectivePillInset,
              transform: [{ translateX }],
              ...(isMinimal && {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 4,
                elevation: 3,
              }),
            },
          ]}
        />
      )}
      {options.map(option => {
        const isSelected = option.id === value;
        return (
          <TouchableOpacity
            key={option.id}
            onPress={() => onChange(option.id)}
            activeOpacity={Opacity.heavy}
            style={[
              styles.option,
              { width: finalItemWidth },
              isSmall && styles.optionSm,
              isLarge && styles.optionLg,
              !scrollable && flex && { flex: 1 },
            ]}
          >
            <View style={styles.optionContent}>
              {option.icon ? (
                <AppIcon
                  name={option.icon}
                  size={14}
                  color={isSelected ? resolvedActiveTextColor : resolvedInactiveTextColor}
                />
              ) : null}
              <AppText
                variant="caption"
                weight={isSelected ? 'bold' : 'medium'}
                style={{
                  color: isSelected ? resolvedActiveTextColor : resolvedInactiveTextColor,
                  textAlign: 'center',
                }}
              >
                {option.label}
              </AppText>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  if (scrollable) {
    return (
      <Box
        onLayout={onContainerLayout}
        style={[
          styles.container,
          { backgroundColor: resolvedTrackColor },
          isMinimal && { padding: 0 },
          flex && { flex: 1 },
        ]}
        borderRadius="full"
      >
        <ScrollView
          ref={scrollViewRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          scrollEnabled={scrollable}
          contentContainerStyle={{ paddingHorizontal: scrollable ? Spacing.md : 0 }}
        >
          {renderContent()}
        </ScrollView>
      </Box>
    );
  }

  return (
    <Box
      onLayout={onContainerLayout}
      style={[
        styles.container,
        { backgroundColor: resolvedTrackColor },
        isMinimal && { padding: 0 },
        flex ? { width: '100%' } : { alignSelf: 'flex-start' },
      ]}
      borderRadius="full"
    >
      {containerWidth > 0 && renderContent()}
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
  containerLg: {
    minHeight: 44,
  },
  pill: {
    position: 'absolute',
    borderRadius: Shape.radius.full,
    zIndex: 0,
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
  optionLg: {
    minHeight: 38,
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
