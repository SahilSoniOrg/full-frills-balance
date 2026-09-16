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
  /** Animated visual surface. Put layout / hit-target styles on `style`. */
  surfaceStyle?: StyleProp<ViewStyle>;
};

/**
 * Touchable chrome control with shared Moti press-scale feedback.
 * Owns the MotiView + press-in/out wiring so AppButton / FAB / IconButton stay declarative.
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
