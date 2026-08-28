import { AppText } from '@/src/components/core';
import { Opacity, Shape, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  recenterRepeatingIndex,
  repeatingCopyCount,
  repeatingIndexForValue,
} from './clockWheelLoop';

export type ClockWheelOption<T extends string> = {
  id: T;
  label: string;
};

type ClockWheelProps<T extends string> = {
  options: readonly ClockWheelOption<T>[];
  value: T;
  onChange: (id: T) => void;
  loop?: boolean;
  itemHeight?: number;
  testID?: string;
};

export function ClockWheel<T extends string>({
  options,
  value,
  onChange,
  loop = true,
  itemHeight = 44,
  testID,
}: ClockWheelProps<T>) {
  const { theme } = useTheme();
  const scrollViewRef = useRef<ScrollView>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const cycleLength = options.length;
  const copies = loop && cycleLength > 0 ? repeatingCopyCount(cycleLength) : 1;
  const paddingVertical = Spacing.md;

  const displayOptions = useMemo(() => {
    if (copies === 1) return [...options];
    const tiled: ClockWheelOption<T>[] = [];
    for (let copy = 0; copy < copies; copy++) {
      tiled.push(...options);
    }
    return tiled;
  }, [copies, options]);

  const valueIndex = Math.max(
    0,
    options.findIndex(option => option.id === value),
  );

  const middleIndex = repeatingIndexForValue(valueIndex, cycleLength, copies);

  const [cursor, setCursor] = useState(() => (loop ? middleIndex : valueIndex));

  const selectedIndex =
    displayOptions[cursor]?.id === value ? cursor : loop ? middleIndex : valueIndex;

  const [scrollValue] = useState(() => new Animated.Value(selectedIndex));

  useEffect(() => {
    if (viewportHeight <= 0) {
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
  }, [selectedIndex, scrollValue, viewportHeight]);

  const offsetForIndex = useCallback(
    (index: number) => {
      const contentSize = itemHeight * displayOptions.length;
      const maxScroll = Math.max(0, contentSize + paddingVertical * 2 - viewportHeight);
      const scrollPos = paddingVertical + index * itemHeight - viewportHeight / 2 + itemHeight / 2;
      return Math.min(Math.max(0, scrollPos), maxScroll);
    },
    [displayOptions.length, itemHeight, paddingVertical, viewportHeight],
  );

  useEffect(() => {
    if (viewportHeight <= 0) return;
    scrollViewRef.current?.scrollTo({
      y: offsetForIndex(selectedIndex),
      animated: true,
    });
  }, [offsetForIndex, selectedIndex, viewportHeight]);

  const indexFromOffset = useCallback(
    (y: number) => {
      const raw = Math.round(
        (y + viewportHeight / 2 - itemHeight / 2 - paddingVertical) / itemHeight,
      );
      return Math.min(Math.max(0, raw), Math.max(0, displayOptions.length - 1));
    },
    [displayOptions.length, itemHeight, paddingVertical, viewportHeight],
  );

  const settleFromOffset = useCallback(
    (y: number) => {
      if (cycleLength === 0 || viewportHeight <= 0) return;
      const clamped = indexFromOffset(y);
      const nextIndex = loop ? recenterRepeatingIndex(clamped, cycleLength, copies) : clamped;
      const next = displayOptions[nextIndex];
      if (!next) return;
      setCursor(nextIndex);
      if (nextIndex !== clamped) {
        scrollViewRef.current?.scrollTo({
          y: offsetForIndex(nextIndex),
          animated: false,
        });
      }
      if (next.id !== value) onChange(next.id);
    },
    [
      copies,
      cycleLength,
      displayOptions,
      indexFromOffset,
      loop,
      offsetForIndex,
      onChange,
      value,
      viewportHeight,
    ],
  );

  const handleScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      settleFromOffset(event.nativeEvent.contentOffset.y);
    },
    [settleFromOffset],
  );

  const handlePress = useCallback(
    (index: number, id: T) => {
      Keyboard.dismiss();
      setCursor(index);
      onChange(id);
    },
    [onChange],
  );

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setViewportHeight(event.nativeEvent.layout.height);
  }, []);

  const translateY = useMemo(
    () =>
      scrollValue.interpolate({
        inputRange: displayOptions.length > 1 ? displayOptions.map((_, i) => i) : [0, 1],
        outputRange:
          displayOptions.length > 1 ? displayOptions.map((_, i) => i * itemHeight) : [0, 0],
        extrapolate: 'clamp',
      }),
    [displayOptions, itemHeight, scrollValue],
  );

  return (
    <View style={styles.fill} onLayout={handleLayout} testID={testID}>
      <ScrollView
        ref={scrollViewRef}
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        snapToInterval={itemHeight}
        decelerationRate="fast"
        keyboardShouldPersistTaps="handled"
        onMomentumScrollEnd={handleScrollEnd}
        contentContainerStyle={{ paddingVertical }}
      >
        <View style={{ height: itemHeight * displayOptions.length, width: '100%' }}>
          {displayOptions.length > 0 && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.pill,
                {
                  height: itemHeight,
                  backgroundColor: theme.primary,
                  transform: [{ translateY }],
                },
              ]}
            />
          )}
          {displayOptions.map((option, index) => {
            const selected = index === selectedIndex;
            return (
              <Pressable
                key={`${index}:${option.id}`}
                onPress={() => handlePress(index, option.id)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={option.label}
                style={({ pressed }) => [
                  styles.item,
                  { height: itemHeight },
                  pressed && { opacity: Opacity.heavy },
                ]}
              >
                <AppText
                  variant="caption"
                  weight={selected ? 'bold' : 'medium'}
                  numberOfLines={1}
                  style={{
                    color: selected ? theme.onPrimary : theme.textSecondary,
                    textAlign: 'center',
                  }}
                >
                  {option.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    minHeight: 0,
  },
  scroll: {
    flex: 1,
    userSelect: 'none',
  },
  pill: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 0,
    borderRadius: Shape.radius.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  item: {
    zIndex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
