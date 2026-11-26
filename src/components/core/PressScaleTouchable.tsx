import { Opacity, Scale } from '@/src/constants/design-tokens';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { triggerPressHaptic, type PressHaptic } from '@/src/design-system/haptics';
import { MotiView } from 'moti';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const PRESS_IN_DURATION_MS = 100;
const PRESS_OUT_DURATION_MS = 150;

/** How far a control shrinks while pressed. */
export type PressScaleAmount = 'default' | 'subtle' | 'none';

const SCALE_BY_AMOUNT: Record<PressScaleAmount, number> = {
  default: Scale.press,
  subtle: Scale.pressSubtle,
  none: Scale.identity,
};

/**
 * Moti animate/transition props for chrome press feedback.
 */
export function usePressScale(amount: PressScaleAmount = 'default') {
  const reduceMotion = useReducedMotion();
  const [pressed, setPressed] = useState(false);
  const pressedScale = SCALE_BY_AMOUNT[amount];

  return {
    reduceMotion,
    pressed,
    animate: { scale: reduceMotion || !pressed ? Scale.identity : pressedScale },
    transition: {
      type: 'timing' as const,
      duration: pressed ? PRESS_IN_DURATION_MS : PRESS_OUT_DURATION_MS,
    },
    handlePressIn: () => setPressed(true),
    handlePressOut: () => setPressed(false),
  };
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressScaleTouchableProps = Omit<PressableProps, 'activeOpacity' | 'style'> & {
  children?: ReactNode;
  /** Stable DOM/native identifier for focus restoration and automation. */
  nativeID?: string;
  /** Layout on the touchable; the animated surface owns visuals in wrapped mode. */
  style?: StyleProp<ViewStyle>;
  /**
   * Styles on an inner animated Moti surface (under the outer pressable).
   * When set, `style` sizes/positions the pressable and `surfaceStyle` owns
   * layout among children. When omitted, the pressable itself scales and
   * `style` lays out children directly (drop-in for a plain pressable).
   */
  surfaceStyle?: StyleProp<ViewStyle>;
  /**
   * Press shrink. `subtle` for full-width rows and list items, `none` where a
   * transform would fight a parent gesture or animation.
   */
  pressScale?: PressScaleAmount;
  /** Haptic intent from the shared PRESS_HAPTICS map. Defaults to none. */
  haptic?: PressHaptic;
  /** Pressed opacity. Defaults to the shared heavy press opacity. */
  activeOpacity?: number;
};

/**
 * The one press component: opacity + scale feedback and opt-in haptics.
 */
export function PressScaleTouchable({
  children,
  style,
  surfaceStyle,
  onPressIn,
  onPressOut,
  onPress,
  pressScale = 'default',
  haptic,
  activeOpacity = Opacity.heavy,
  ...props
}: PressScaleTouchableProps) {
  const { reduceMotion, animate, pressed, transition, handlePressIn, handlePressOut } =
    usePressScale(pressScale);
  const wrapped = surfaceStyle !== undefined;
  // TouchableOpacity seeded its animated opacity from the flattened style, so a
  // dimmed caller (archived row, disabled pill) kept its rest opacity. Preserve
  // that contract: the animated opacity runs between the caller's opacity and
  // activeOpacity instead of between 1 and activeOpacity.
  const flattenedOpacity = StyleSheet.flatten(wrapped ? surfaceStyle : style)?.opacity;
  const baseOpacity = typeof flattenedOpacity === 'number' ? flattenedOpacity : 1;
  const scale = useSharedValue<number>(Scale.identity);
  const opacity = useSharedValue<number>(baseOpacity);
  const previousBaseOpacity = useRef(baseOpacity);
  // Pressable delays onPressOut to guarantee a minimum press duration (130ms),
  // so a quick tap's release can run after a selection re-render. Read the
  // latest rest opacity instead of the one captured by the stale handler.
  const baseOpacityRef = useRef(baseOpacity);
  const animateScale = !wrapped && pressScale !== 'none' && !reduceMotion;
  const animateOpacity = !wrapped && activeOpacity !== 1;

  useEffect(() => {
    baseOpacityRef.current = baseOpacity;
    if (previousBaseOpacity.current === baseOpacity) return;
    previousBaseOpacity.current = baseOpacity;
    if (!animateOpacity) return;
    opacity.set(withTiming(baseOpacity, { duration: PRESS_OUT_DURATION_MS }));
  }, [animateOpacity, baseOpacity, opacity]);

  useEffect(() => {
    if (!props.disabled) return;
    if (wrapped && pressed) handlePressOut();
    if (!wrapped) {
      scale.set(Scale.identity);
      opacity.set(baseOpacityRef.current);
    }
  }, [props.disabled, wrapped, pressed, handlePressOut, scale, opacity]);

  useEffect(() => {
    if (!wrapped && !animateScale) {
      scale.set(Scale.identity);
    }
  }, [wrapped, animateScale, scale]);

  const pressStyle = useAnimatedStyle(() => {
    const animatedStyle: ViewStyle = {};
    if (animateScale) animatedStyle.transform = [{ scale: scale.get() }];
    if (animateOpacity) animatedStyle.opacity = opacity.get();
    return animatedStyle;
  });

  const pressHandlers = {
    onPress:
      onPress && haptic && haptic !== 'none'
        ? (event: GestureResponderEvent) => {
            triggerPressHaptic(haptic);
            onPress(event);
          }
        : onPress,
    onPressIn: (event: GestureResponderEvent) => {
      onPressIn?.(event);
      if (wrapped) {
        handlePressIn();
        return;
      }
      if (animateScale) {
        scale.set(withTiming(SCALE_BY_AMOUNT[pressScale], { duration: PRESS_IN_DURATION_MS }));
      }
      if (animateOpacity) {
        opacity.set(
          withTiming(Math.min(baseOpacityRef.current, activeOpacity), {
            duration: PRESS_IN_DURATION_MS,
          }),
        );
      }
    },
    onPressOut: (event: GestureResponderEvent) => {
      onPressOut?.(event);
      if (wrapped) {
        handlePressOut();
        return;
      }
      if (animateScale) {
        scale.set(withTiming(Scale.identity, { duration: PRESS_OUT_DURATION_MS }));
      }
      if (animateOpacity) {
        opacity.set(withTiming(baseOpacityRef.current, { duration: PRESS_OUT_DURATION_MS }));
      }
    },
  };

  if (wrapped) {
    return (
      <Pressable {...props} {...pressHandlers} style={style}>
        <MotiView
          animate={
            activeOpacity === 1
              ? animate
              : {
                  ...animate,
                  opacity: pressed ? Math.min(baseOpacity, activeOpacity) : baseOpacity,
                }
          }
          transition={{
            ...transition,
            duration: reduceMotion ? 0 : transition.duration,
          }}
          style={surfaceStyle}
        >
          {children}
        </MotiView>
      </Pressable>
    );
  }

  return (
    <AnimatedPressable {...props} {...pressHandlers} style={[style, pressStyle]}>
      {children}
    </AnimatedPressable>
  );
}
