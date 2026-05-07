import { Spacing, withOpacity } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native';
import { AppText } from '../core/AppText';

interface ProgressBarProps {
  progress: number; // 0 to 1
  label?: string;
  showPercentage?: boolean;
  style?: ViewStyle;
}

export function ProgressBar({ progress, label, showPercentage = true, style }: ProgressBarProps) {
  const { theme } = useTheme();
  const animatedValue = useRef(new Animated.Value(progress)).current;
  const [width, setWidth] = React.useState(0);

  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: progress,
      useNativeDriver: true,
      duration: 300,
    }).start();
  }, [progress, animatedValue]);

  const translateX = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [-width || -500, 0], // Fallback to -500 if width not yet measured
  });

  return (
    <View style={[styles.container, style]}>
      <View style={styles.header}>
        {label ? (
          <AppText variant="caption" color="secondary" style={styles.label} numberOfLines={1}>
            {label}
          </AppText>
        ) : null}
        {showPercentage ? (
          <AppText variant="caption" color="secondary" style={styles.percentage}>
            {Math.round(progress * 100)}%
          </AppText>
        ) : null}
      </View>
      <View
        style={[styles.track, { backgroundColor: withOpacity(theme.primary, 0.1) }]}
        onLayout={e => setWidth(e.nativeEvent.layout.width)}
      >
        <Animated.View
          style={[
            styles.fill,
            {
              backgroundColor: theme.primary,
              width: '100%',
              transform: [{ translateX }],
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginVertical: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  label: {
    flex: 1,
  },
  percentage: {
    marginLeft: Spacing.sm,
    fontVariant: ['tabular-nums'],
  },
  track: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
});
