import { Opacity, Scale } from '@/src/constants/design-tokens';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { MotiView } from 'moti';
import { useState, type ReactNode } from 'react';
import {
  TouchableOpacity,
  type GestureResponderEvent,
  type StyleProp,
  type TouchableOpacityProps,
  type ViewStyle,
} from 'react-native';

export const PRESS_SCALE = Scale.press;
const PRESS_IN_DURATION_MS = 100;
const PRESS_OUT_DURATION_MS = 150;

/**
 * Moti animate/transition props for chrome press feedback.
 */
export function usePressScale() {
  const reduceMotion = useReducedMotion();
  const [pressed, setPressed] = useState(false);

  return {
    animate: { scale: reduceMotion || !pressed ? Scale.identity : PRESS_SCALE },
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

export type PressScaleTouchableProps = Omit<TouchableOpacityProps, 'activeOpacity'> & {
  children: ReactNode;
  /**
   * Styles on the animated Moti surface (under the outer touchable).
   * Put flexDirection / alignItems / gap / visual chrome here when the control
   * has multiple children that must lay out as a row or column.
   * Outer `style` is for margin, width, and hit-target geometry only — flex on
   * `style` alone stacks siblings vertically under Moti (see PlannedPaymentsSection).
   */
  surfaceStyle?: StyleProp<ViewStyle>;
};

/**
 * Touchable chrome control with shared Moti press-scale feedback.
 * Owns the MotiView + press-in/out wiring so AppButton / FAB / IconButton stay declarative.
 *
 * `style` vs `surfaceStyle`: outer `style` sizes/positions the touchable; `surfaceStyle`
 * owns layout among children. Flex on `style` alone stacks siblings under Moti.
 */
export function PressScaleTouchable({
  children,
  style,
  surfaceStyle,
  onPressIn,
  onPressOut,
  ...props
}: PressScaleTouchableProps) {
  const { animate, transition, handlePressIn, handlePressOut } = usePressScale();

  return (
    <TouchableOpacity
      {...props}
      style={style}
      activeOpacity={Opacity.heavy}
      onPressIn={(event: GestureResponderEvent) => {
        onPressIn?.(event);
        handlePressIn();
      }}
      onPressOut={(event: GestureResponderEvent) => {
        onPressOut?.(event);
        handlePressOut();
      }}
    >
      <MotiView animate={animate} transition={transition} style={surfaceStyle}>
        {children}
      </MotiView>
    </TouchableOpacity>
  );
}
