import { Animated } from 'react-native';

type SpringConfig = Omit<Animated.SpringAnimationConfig, 'toValue' | 'useNativeDriver'>;

export function animateValue({
  value,
  toValue,
  reduceMotion,
  config,
}: {
  value: Animated.Value;
  toValue: number;
  reduceMotion: boolean;
  config: SpringConfig;
}): void {
  value.stopAnimation();

  if (reduceMotion) {
    value.setValue(toValue);
    return;
  }

  Animated.spring(value, {
    ...config,
    toValue,
    useNativeDriver: true,
  }).start();
}
