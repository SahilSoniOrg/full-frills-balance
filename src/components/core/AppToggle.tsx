import { useState, useEffect } from 'react';
import { Opacity, Shape } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { Animated, StyleSheet, TouchableOpacity } from 'react-native';

export interface AppToggleProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}

/**
 * AppToggle - A premium, custom switch component
 * Provides a more tactile and visually appealing experience than the standard Switch.
 */
export const AppToggle = ({ value, onValueChange, disabled = false }: AppToggleProps) => {
  const { theme } = useTheme();
  const [animatedValue] = useState(() => new Animated.Value(value ? 1 : 0));

  useEffect(() => {
    Animated.spring(animatedValue, {
      toValue: value ? 1 : 0,
      useNativeDriver: false, // Color and Layout animations often need false, but position can use true
      friction: 10,
      tension: 50,
    }).start();
  }, [value, animatedValue]);

  const translateX = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [2, 22], // adjust based on width
  });

  const backgroundColor = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.surfaceSecondary, theme.primary],
  });

  return (
    <TouchableOpacity
      activeOpacity={Opacity.heavy}
      onPress={() => !disabled && onValueChange(!value)}
      disabled={disabled}
    >
      <Animated.View
        style={[
          styles.container,
          {
            backgroundColor,
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.circle,
            {
              transform: [{ translateX }],
              backgroundColor: theme.pureInverse,
            },
          ]}
        />
      </Animated.View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 48,
    height: 28,
    borderRadius: Shape.radius.full,
    justifyContent: 'center',
    padding: 2,
  },
  circle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    // Subtle shadow for the "knob"
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 2,
  },
});
