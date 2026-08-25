import { Opacity, Shape, Spacing } from '@/src/constants';
import { Box } from '@/src/design-system/Box';
import { resolveThemeColor } from '@/src/design-system/utils';
import { useTheme } from '@/src/hooks/use-theme';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  DimensionValue,
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  FlexStyle,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
  Keyboard,
} from 'react-native';
import { logger } from '@/src/utils/logger';
import { AppIcon } from './AppIcon';
import type { IconName } from '@/src/types/domainIcons';
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
  flex?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'minimal';
  scrollable?: boolean;
  itemWidth?: number;
  itemHeight?: number;
  minWidth?: number;
  trackColor?: string;
  pillColor?: string;
  activeTextColor?: string;
  inactiveTextColor?: string;
  orientation?: 'horizontal' | 'vertical';
  disabled?: boolean;
  disabledOptions?: T[];
  testID?: string;
}

interface SegmentedItemProps<T extends string | number> {
  option: SegmentedOption<T>;
  isSelected: boolean;
  onPress: (id: T) => void;
  width: DimensionValue;
  height: DimensionValue;
  activeColor?: string;
  inactiveColor?: string;
  isSmall: boolean;
  isLarge: boolean;
  isVertical: boolean;
  flex: boolean;
  minWidth?: number;
  disabled?: boolean;
  testID?: string;
}

/**
 * SegmentedItem - Memoized individual option component using Pressable
 */
const SegmentedItem = <T extends string | number>({
  option,
  isSelected,
  onPress,
  width,
  height,
  activeColor,
  inactiveColor,
  isSmall,
  isLarge,
  isVertical,
  flex,
  minWidth,
  disabled,
  testID,
}: SegmentedItemProps<T>) => {
  return (
    <Pressable
      onPress={() => {
        Keyboard.dismiss();
        onPress(option.id);
      }}
      disabled={disabled}
      testID={testID}
      accessibilityRole="tab"
      accessibilityState={{ selected: isSelected, disabled }}
      accessibilityLabel={option.label}
      style={({ pressed }) => [
        styles.option,
        { width, height },
        minWidth ? { minWidth } : null,
        isSmall && styles.optionSm,
        isLarge && styles.optionLg,
        !isVertical && flex && { flex: 1 },
        pressed && !disabled && { opacity: Opacity.heavy },
        disabled && { opacity: Opacity.muted },
      ]}
    >
      <View style={styles.optionContent}>
        {option.icon && (
          <AppIcon name={option.icon} size={14} color={isSelected ? activeColor : inactiveColor} />
        )}
        <AppText
          variant="caption"
          weight={isSelected ? 'bold' : 'medium'}
          numberOfLines={1}
          ellipsizeMode="tail"
          style={{
            color: isSelected ? activeColor : inactiveColor,
            textAlign: 'center',
          }}
        >
          {option.label}
        </AppText>
      </View>
    </Pressable>
  );
};

const MemoizedSegmentedItem = memo(SegmentedItem) as typeof SegmentedItem;

/**
 * AppSegmentedControl v2 - A production-grade, accessible, and performant pill selector.
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
  itemHeight: propItemHeight,
  minWidth,
  trackColor,
  pillColor,
  activeTextColor,
  inactiveTextColor,
  orientation = 'horizontal',
  disabled = false,
  disabledOptions = [],
  testID,
}: AppSegmentedControlProps<T>) => {
  const { theme } = useTheme();
  const scrollViewRef = useRef<ScrollView>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  const isSmall = size === 'sm';
  const isLarge = size === 'lg';
  const isMinimal = variant === 'minimal';
  const isVertical = orientation === 'vertical';

  // 1. Resolve Colors
  const colors = useMemo(
    () => ({
      track: resolveThemeColor(
        theme,
        trackColor || (isMinimal ? 'transparent' : theme.surfaceSecondary),
      ),
      pill: resolveThemeColor(theme, pillColor || theme.primary),
      activeText: resolveThemeColor(theme, activeTextColor || theme.onPrimary),
      inactiveText: resolveThemeColor(theme, inactiveTextColor || theme.textSecondary),
    }),
    [theme, trackColor, pillColor, activeTextColor, inactiveTextColor, isMinimal],
  );

  // 2. Layout Calculations
  const layout = useMemo(() => {
    const pillInset = isSmall ? 2 : isLarge ? 4 : 3;
    const effectivePillInset = isMinimal ? 0 : pillInset;
    const horizontalHeight = isSmall ? 28 : isLarge ? 48 : 40;

    const itemWidth = isVertical
      ? flex
        ? Math.max(0, containerSize.width - effectivePillInset * 2)
        : minWidth || 44
      : scrollable
        ? propItemWidth || (isSmall ? 44 : 64)
        : options.length > 0
          ? flex
            ? Math.max(0, containerSize.width - effectivePillInset * 2) / options.length
            : propItemWidth || minWidth || (isSmall ? 44 : 64)
          : 0;

    const itemHeight = isVertical
      ? propItemHeight || (isSmall ? 32 : 44)
      : Math.max(0, containerSize.height - (isMinimal ? 0 : pillInset * 2));

    const contentSize = isVertical
      ? itemHeight * options.length
      : scrollable
        ? itemWidth * options.length
        : Math.max(0, containerSize.width - effectivePillInset * 2);

    return {
      itemWidth,
      itemHeight,
      contentSize,
      pillInset,
      effectivePillInset,
      horizontalHeight,
    };
  }, [
    containerSize,
    options.length,
    isSmall,
    isLarge,
    isMinimal,
    isVertical,
    scrollable,
    propItemWidth,
    propItemHeight,
    minWidth,
    flex,
  ]);

  // 3. Animation State
  const selectedIndex = useMemo(() => {
    const idx = options.findIndex(opt => opt.id === value);
    if (__DEV__ && idx === -1 && options.length > 0) {
      logger.warn(
        `[AppSegmentedControl] Invalid value "${value}" provided. Falling back to index 0.`,
      );
    }
    return idx === -1 ? 0 : idx;
  }, [options, value]);

  const [scrollValue] = useState(() => new Animated.Value(selectedIndex));

  useEffect(() => {
    const hasSize = isVertical ? containerSize.height > 0 : containerSize.width > 0;
    if (!hasSize) {
      scrollValue.setValue(selectedIndex);
      return;
    }

    scrollValue.stopAnimation();
    Animated.spring(scrollValue, {
      toValue: selectedIndex,
      useNativeDriver: true,
      friction: 10,
      tension: 60,
    }).start();
  }, [selectedIndex, containerSize, isVertical, scrollValue]);

  // 4. Scroll Management
  useEffect(() => {
    const hasSize = isVertical ? containerSize.height > 0 : containerSize.width > 0;
    if (scrollable && scrollViewRef.current && hasSize) {
      const currentSize = isVertical ? containerSize.height : containerSize.width;
      const currentItemSize = isVertical ? layout.itemHeight : layout.itemWidth;
      const maxScroll = Math.max(0, layout.contentSize - currentSize);

      const scrollPos = selectedIndex * currentItemSize - currentSize / 2 + currentItemSize / 2;
      const clampedPos = Math.min(Math.max(0, scrollPos), maxScroll);

      const scrollConfig = isVertical ? { y: clampedPos } : { x: clampedPos };
      scrollViewRef.current.scrollTo({ ...scrollConfig, animated: true });
    }
  }, [
    selectedIndex,
    scrollable,
    containerSize,
    layout.itemWidth,
    layout.itemHeight,
    layout.contentSize,
    isVertical,
  ]);

  // 5. Handlers
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setContainerSize(prev => {
      if (prev.width === width && prev.height === height) return prev;
      return { width, height };
    });
  }, []);

  const disabledSet = useMemo(() => new Set(disabledOptions), [disabledOptions]);

  const handlePress = useCallback(
    (id: T) => {
      if (disabled || disabledSet.has(id)) return;
      onChange(id);
    },
    [disabled, disabledSet, onChange],
  );

  // 6. Interpolations
  const translate = useMemo(
    () =>
      scrollValue.interpolate({
        inputRange: options.length > 1 ? options.map((_, i) => i) : [0, 1],
        outputRange:
          options.length > 1
            ? options.map((_, i) => i * (isVertical ? layout.itemHeight : layout.itemWidth))
            : [0, 0],
        extrapolate: 'clamp',
      }),
    [options, isVertical, layout.itemHeight, layout.itemWidth, scrollValue],
  );

  const transform = useMemo(
    () => (isVertical ? [{ translateY: translate }] : [{ translateX: translate }]),
    [isVertical, translate],
  );

  // 7. Render Helpers
  const renderedOptions = useMemo(
    () =>
      options.map(option => (
        <MemoizedSegmentedItem
          key={option.id}
          option={option}
          isSelected={option.id === value}
          onPress={handlePress}
          width={layout.itemWidth}
          height={isVertical ? layout.itemHeight : '100%'}
          activeColor={colors.activeText}
          inactiveColor={colors.inactiveText}
          isSmall={isSmall}
          isLarge={isLarge}
          isVertical={isVertical}
          flex={flex}
          minWidth={minWidth}
          disabled={disabled || disabledSet.has(option.id)}
          testID={testID ? `${testID}-item-${option.id}` : undefined}
        />
      )),
    [
      options,
      value,
      handlePress,
      layout.itemWidth,
      layout.itemHeight,
      colors.activeText,
      colors.inactiveText,
      isSmall,
      isLarge,
      isVertical,
      flex,
      minWidth,
      disabled,
      disabledSet,
      testID,
    ],
  );

  const contentStyle = useMemo(
    () =>
      [
        {
          width: isVertical ? '100%' : scrollable ? layout.contentSize : '100%',
          height: isVertical ? layout.contentSize : '100%',
          flexDirection: (isVertical ? 'column' : 'row') as 'column' | 'row',
        },
      ] as StyleProp<ViewStyle>,
    [isVertical, scrollable, layout.contentSize],
  );

  const pillStyle = useMemo(
    () =>
      [
        styles.pill,
        {
          width: layout.itemWidth,
          backgroundColor: colors.pill,
          top: isVertical ? 0 : isMinimal ? 0 : layout.pillInset,
          bottom: isVertical ? 0 : isMinimal ? 0 : layout.pillInset,
          left: isVertical ? 0 : layout.effectivePillInset,
          transform,
          ...(isVertical && { height: layout.itemHeight, borderRadius: Shape.radius.md }),
          ...(isMinimal && styles.minimalPillShadow),
        },
      ] as StyleProp<ViewStyle>,
    [
      layout.itemWidth,
      layout.itemHeight,
      layout.pillInset,
      layout.effectivePillInset,
      colors.pill,
      isVertical,
      isMinimal,
      transform,
    ],
  );

  const hasSize = isVertical ? containerSize.height > 0 : containerSize.width > 0;

  const containerStyle = useMemo(
    () =>
      [
        styles.container,
        isSmall && styles.containerSm,
        isLarge && styles.containerLg,
        { backgroundColor: colors.track },
        isMinimal && { padding: 0 },
        isVertical
          ? { minHeight: 0, minWidth: minWidth || 44 }
          : {
              height: layout.horizontalHeight,
              width: flex ? '100%' : 'auto',
              alignSelf: (flex ? 'stretch' : 'flex-start') as FlexStyle['alignSelf'],
              minWidth,
            },
      ] as StyleProp<ViewStyle>,
    [
      isSmall,
      isLarge,
      colors.track,
      isMinimal,
      isVertical,
      layout.horizontalHeight,
      flex,
      minWidth,
    ],
  );

  if (scrollable) {
    return (
      <Box
        onLayout={handleLayout}
        style={containerStyle}
        borderRadius={isVertical ? 'r4' : 'full'}
        accessibilityRole="tablist"
        testID={testID}
      >
        <ScrollView
          ref={scrollViewRef}
          horizontal={!isVertical}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          scrollEnabled={scrollable}
          snapToInterval={isVertical ? layout.itemHeight : layout.itemWidth}
          decelerationRate="fast"
          contentContainerStyle={{
            paddingHorizontal: !isVertical ? Spacing.md : 0,
            paddingVertical: isVertical ? Spacing.md : 0,
          }}
        >
          {(hasSize || !flex) && (
            <View style={[contentStyle, flex && !hasSize && { opacity: 0 }]}>
              {options.length > 0 && <Animated.View style={pillStyle} />}
              {renderedOptions}
            </View>
          )}
        </ScrollView>
      </Box>
    );
  }

  return (
    <Box
      onLayout={handleLayout}
      style={containerStyle}
      borderRadius={isVertical ? 'r4' : 'full'}
      accessibilityRole="tablist"
      testID={testID}
    >
      {(hasSize || !flex) && (
        <View style={[contentStyle, flex && !hasSize && { opacity: 0 }]}>
          {options.length > 0 && <Animated.View style={pillStyle} />}
          {renderedOptions}
        </View>
      )}
    </Box>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    overflow: 'hidden',
  },
  containerSm: {
    minHeight: 28,
  },
  containerLg: {
    minHeight: 48,
  },
  pill: {
    position: 'absolute',
    borderRadius: Shape.radius.full,
    zIndex: 0,
  },
  minimalPillShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  option: {
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
