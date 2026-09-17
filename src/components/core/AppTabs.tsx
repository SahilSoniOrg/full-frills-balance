import { BorderWidth, ChromeMotion, Opacity, Size, Spacing } from '@/src/constants';
import { Box, Text } from '@/src/design-system';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { useTheme } from '@/src/hooks/use-theme';
import { triggerHaptic } from '@/src/utils/haptics';
import React, { memo, useEffect, useRef, useState } from 'react';
import {
  Animated,
  LayoutChangeEvent,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';

export interface TabOption<T extends string | number = string> {
  id: T;
  label: string;
  badge?: string | number;
}

interface AppTabsProps<T extends string | number> {
  options: readonly TabOption<T>[];
  value: T;
  onChange: (id: T) => void;
  testID?: string;
}

type TabLayout = { x: number; width: number };

/**
 * Shared header tabs with a springing underline.
 * Track lives inside a horizontal ScrollView so dense tab sets (e.g. Reports V2)
 * stay reachable without a one-off shell — onLayout x stays relative to the track.
 * Selected tabs are scrolled into view after layout / value changes.
 */
function AppTabsComponent<T extends string | number>({
  options,
  value,
  onChange,
  testID,
}: AppTabsProps<T>) {
  const { theme } = useTheme();
  const reduceMotion = useReducedMotion();
  const scrollRef = useRef<ScrollView>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [layouts, setLayouts] = useState<Partial<Record<string, TabLayout>>>({});
  const [indicatorX] = useState(() => new Animated.Value(0));
  const [indicatorWidth] = useState(() => new Animated.Value(0));
  const hasPlacedIndicator = useRef(false);

  const selectedKey = String(value);
  const selectedLayout = layouts[selectedKey];

  useEffect(() => {
    if (!selectedLayout || selectedLayout.width <= 0) return;

    if (reduceMotion || !hasPlacedIndicator.current) {
      indicatorX.setValue(selectedLayout.x);
      indicatorWidth.setValue(selectedLayout.width);
      hasPlacedIndicator.current = true;
    } else {
      indicatorX.stopAnimation();
      indicatorWidth.stopAnimation();
      Animated.parallel([
        Animated.spring(indicatorX, {
          toValue: selectedLayout.x,
          useNativeDriver: false,
          ...ChromeMotion.rnIndicator,
        }),
        Animated.spring(indicatorWidth, {
          toValue: selectedLayout.width,
          useNativeDriver: false,
          ...ChromeMotion.rnIndicator,
        }),
      ]).start();
    }

    if (viewportWidth > 0) {
      // Tab onLayout x is relative to the track; content also has horizontal padding.
      const tabLeftInContent = Spacing.lg + selectedLayout.x;
      const centeredOffset = tabLeftInContent - (viewportWidth - selectedLayout.width) / 2;
      scrollRef.current?.scrollTo({
        x: Math.max(0, centeredOffset),
        animated: !reduceMotion,
      });
    }
  }, [selectedLayout, reduceMotion, indicatorX, indicatorWidth, viewportWidth]);

  const handleTabLayout = (id: T, event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    const key = String(id);
    setLayouts(prev => {
      const current = prev[key];
      if (current && current.x === x && current.width === width) return prev;
      return { ...prev, [key]: { x, width } };
    });
  };

  const handlePress = (id: T) => {
    if (id === value) return;
    void triggerHaptic('light');
    onChange(id);
  };

  return (
    <Box borderBottomWidth={1} borderColor="border" accessibilityRole="tablist" testID={testID}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        onLayout={event => {
          setViewportWidth(event.nativeEvent.layout.width);
        }}
        testID={testID ? `${testID}-scroll` : 'tab-scroll'}
      >
        <View style={styles.track}>
          {options.map(option => {
            const isSelected = option.id === value;
            return (
              <TouchableOpacity
                key={option.id}
                onPress={() => handlePress(option.id)}
                onLayout={event => handleTabLayout(option.id, event)}
                accessibilityRole="tab"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={option.label}
                activeOpacity={Opacity.heavy}
                testID={testID ? `${testID}-item-${option.id}` : `tab-item-${option.id}`}
                style={styles.tab}
              >
                <Box flexDirection="row" alignItems="center" gap="xs">
                  <Text
                    variant="base"
                    weight={isSelected ? 'bold' : 'medium'}
                    style={{ color: isSelected ? theme.primary : theme.textSecondary }}
                  >
                    {option.label}
                  </Text>
                  {option.badge !== undefined && (
                    <Box
                      background={isSelected ? 'primary' : 'surfaceSecondary'}
                      paddingHorizontal="xs"
                      borderRadius="full"
                      minWidth={Size.sm}
                      alignItems="center"
                      justifyContent="center"
                    >
                      <Text
                        variant="xs"
                        weight="bold"
                        style={{
                          color: isSelected ? theme.onPrimary : theme.textSecondary,
                          fontSize: 10,
                        }}
                      >
                        {option.badge}
                      </Text>
                    </Box>
                  )}
                </Box>
              </TouchableOpacity>
            );
          })}
          {selectedLayout ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.indicator,
                {
                  backgroundColor: theme.primary,
                  width: indicatorWidth,
                  transform: [{ translateX: indicatorX }],
                },
              ]}
              testID={testID ? `${testID}-indicator` : 'tab-indicator'}
            />
          ) : null}
        </View>
      </ScrollView>
    </Box>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    flexGrow: 1,
  },
  track: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: -1, // Overlap with container border
    minHeight: Size.touchTarget,
  },
  tab: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  indicator: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    height: BorderWidth.medium,
  },
});

export const AppTabs = memo(AppTabsComponent) as <T extends string | number>(
  props: AppTabsProps<T>,
) => React.ReactElement;
