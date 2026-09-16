import { Opacity, Spacing } from '@/src/constants';
import { Box, Text } from '@/src/design-system';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { useTheme } from '@/src/hooks/use-theme';
import { triggerHaptic } from '@/src/utils/haptics';
import React, { memo, useEffect, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, StyleSheet, TouchableOpacity, View } from 'react-native';

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
 * AppTabs - Shared header tabs with a springing underline (matches AppSegmentedControl feel).
 */
function AppTabsComponent<T extends string | number>({
  options,
  value,
  onChange,
  testID,
}: AppTabsProps<T>) {
  const { theme } = useTheme();
  const reduceMotion = useReducedMotion();
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
      return;
    }

    indicatorX.stopAnimation();
    indicatorWidth.stopAnimation();
    Animated.parallel([
      Animated.spring(indicatorX, {
        toValue: selectedLayout.x,
        useNativeDriver: false,
        friction: 10,
        tension: 60,
      }),
      Animated.spring(indicatorWidth, {
        toValue: selectedLayout.width,
        useNativeDriver: false,
        friction: 10,
        tension: 60,
      }),
    ]).start();
  }, [selectedLayout, reduceMotion, indicatorX, indicatorWidth]);

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
    <Box
      flexDirection="row"
      borderBottomWidth={1}
      borderColor="border"
      paddingHorizontal="lg"
      accessibilityRole="tablist"
      testID={testID}
    >
      {/* Plain row so onLayout x/width are relative to the indicator's parent. */}
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
                    minWidth={20}
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
    </Box>
  );
}

const styles = StyleSheet.create({
  track: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: -1, // Overlap with container border
  },
  tab: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  indicator: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    height: 2,
  },
});

export const AppTabs = memo(AppTabsComponent) as <T extends string | number>(
  props: AppTabsProps<T>,
) => React.ReactElement;
