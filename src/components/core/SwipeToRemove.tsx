import { AppIcon } from './AppIcon';
import { AppText } from './AppText';
import { Size, Spacing } from '@/src/constants';
import { Box } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { Icon } from '@/src/types/domainIcons';
import { type ReactNode } from 'react';
import { StyleSheet, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

export function SwipeToRemove({
  label,
  onRemove,
  children,
}: {
  readonly label: string;
  readonly onRemove: () => void;
  readonly children: ReactNode;
}) {
  const { theme } = useTheme();
  const translateX = useSharedValue(0);
  const reveal = useSharedValue(0);
  const height = useSharedValue(0);
  const measuredHeight = useSharedValue(0);
  const collapsing = useSharedValue(0);

  const gesture = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-16, 16])
    .onUpdate(event => {
      if (collapsing.value === 1) return;
      translateX.value = Math.min(0, event.translationX);
      reveal.value = interpolate(translateX.value, [-96, -8], [1, 0], Extrapolation.CLAMP);
    })
    .onEnd(event => {
      if (collapsing.value === 1) return;
      const shouldRemove = event.translationX < -72 || event.velocityX < -900;
      if (!shouldRemove) {
        translateX.value = withTiming(0, { duration: 240, easing: Easing.out(Easing.cubic) });
        reveal.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });
        return;
      }
      collapsing.value = 1;
      height.value = measuredHeight.value;
      translateX.value = withTiming(-520, { duration: 220, easing: Easing.out(Easing.cubic) });
      reveal.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });
      height.value = withTiming(
        0,
        { duration: 320, easing: Easing.inOut(Easing.cubic) },
        finished => {
          if (finished) runOnJS(onRemove)();
        },
      );
    });
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));
  const revealStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
  }));
  const wrapperStyle = useAnimatedStyle(() =>
    collapsing.value === 0
      ? {}
      : {
          height: height.value,
          overflow: 'hidden' as const,
          opacity: interpolate(
            height.value,
            [0, Math.max(measuredHeight.value, 1)],
            [0, 1],
            Extrapolation.CLAMP,
          ),
        },
  );

  const onLayout = (event: LayoutChangeEvent) => {
    if (collapsing.value === 1) return;
    // Reanimated shared value, not React state.
    // eslint-disable-next-line react-hooks/immutability
    measuredHeight.value = event.nativeEvent.layout.height;
  };

  return (
    <Animated.View onLayout={onLayout} style={wrapperStyle}>
      <Box overflow="hidden" borderRadius="r2">
        <Animated.View
          pointerEvents="none"
          style={[styles.swipeReveal, { backgroundColor: theme.error }, revealStyle]}
        >
          <AppIcon name={Icon.Delete} size={Size.iconSm} color={theme.onPrimary} />
          <AppText variant="caption" weight="semibold" style={{ color: theme.onPrimary }}>
            {label}
          </AppText>
        </Animated.View>
        <GestureDetector gesture={gesture}>
          <Animated.View style={sheetStyle}>{children}</Animated.View>
        </GestureDetector>
      </Box>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  swipeReveal: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
    paddingRight: Spacing.lg,
  },
});
