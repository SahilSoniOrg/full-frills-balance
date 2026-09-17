import { Opacity } from '@/src/constants/design-tokens';
import { usePressScale } from '@/src/hooks/usePressScale';
import { MotiView } from 'moti';
import type { ReactNode } from 'react';
import {
  TouchableOpacity,
  type GestureResponderEvent,
  type StyleProp,
  type TouchableOpacityProps,
  type ViewStyle,
} from 'react-native';

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
