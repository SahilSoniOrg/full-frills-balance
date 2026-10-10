import { Opacity, Scale } from '@/src/constants/design-tokens';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { triggerPressHaptic, type PressHaptic } from '@/src/utils/haptics';
import { MotiView } from 'moti';
import { useState, type ReactNode } from 'react';
import {
  TouchableOpacity,
  type GestureResponderEvent,
  type StyleProp,
  type TouchableOpacityProps,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

export const PRESS_SCALE = Scale.press;
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
    animate: { scale: reduceMotion || !pressed ? Scale.identity : pressedScale },
    transition: {
      type: 'timing' as const,
      duration: pressed ? PRESS_IN_DURATION_MS : PRESS_OUT_DURATION_MS,
    },
    handlePressIn: () => {
      if (!reduceMotion) setPressed(true);
    },
    handlePressOut: () => {
      if (!reduceMotion) setPressed(false);
    },
  };
}

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export type PressScaleTouchableProps = Omit<TouchableOpacityProps, 'activeOpacity'> & {
  children?: ReactNode;
  /**
   * Styles on an inner animated Moti surface (under the outer touchable).
   * When set, `style` sizes/positions the touchable and `surfaceStyle` owns
   * layout among children. When omitted, the touchable itself scales and
   * `style` lays out children directly (drop-in for TouchableOpacity).
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
  const { animate, transition, handlePressIn, handlePressOut } = usePressScale(pressScale);
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue<number>(Scale.identity);
  const scaleStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const wrapped = surfaceStyle !== undefined;
  const animateSelf = !wrapped && pressScale !== 'none' && !reduceMotion;

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
      if (wrapped) handlePressIn();
      else if (animateSelf)
        scale.set(withTiming(SCALE_BY_AMOUNT[pressScale], { duration: PRESS_IN_DURATION_MS }));
    },
    onPressOut: (event: GestureResponderEvent) => {
      onPressOut?.(event);
      if (wrapped) handlePressOut();
      else if (animateSelf)
        scale.set(withTiming(Scale.identity, { duration: PRESS_OUT_DURATION_MS }));
    },
  };

  if (wrapped) {
    return (
      <TouchableOpacity {...props} {...pressHandlers} style={style} activeOpacity={activeOpacity}>
        <MotiView animate={animate} transition={transition} style={surfaceStyle}>
          {children}
        </MotiView>
      </TouchableOpacity>
    );
  }

  return (
    <AnimatedTouchable
      {...props}
      {...pressHandlers}
      style={animateSelf ? [style, scaleStyle] : style}
      activeOpacity={activeOpacity}
    >
      {children}
    </AnimatedTouchable>
  );
}
