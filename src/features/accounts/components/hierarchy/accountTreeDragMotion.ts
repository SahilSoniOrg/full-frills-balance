import { DeepSpacePalette, Shape } from '@/src/constants';
import type { SharedValue } from 'react-native-reanimated';

/** Shared Reanimated values that drive the floating drag + lift chrome. */
export interface AccountTreeDragMotion {
  translationY: SharedValue<number>;
  scrollDelta: SharedValue<number>;
  liftProgress: SharedValue<number>;
}

export const ACCOUNT_TREE_DRAG_UPDATE_MIN_DELTA = 8;
export const ACCOUNT_TREE_DRAG_LIFT_SCALE = 1.02;
export const ACCOUNT_TREE_MAKE_ROOM_MS = 220;
export const ACCOUNT_TREE_DRAG_LONG_PRESS_MS = 180;
export const ACCOUNT_TREE_INTENT_MS = 140;
export const ACCOUNT_TREE_FLASH_IN_MS = 120;
export const ACCOUNT_TREE_FLASH_OUT_MS = 580;
export const ACCOUNT_TREE_DROP_CHIP_ENTER_MS = 160;
export const ACCOUNT_TREE_DROP_CHIP_EXIT_MS = 120;
export const ACCOUNT_TREE_SETTLE_LIFT_CANCEL_MS = 160;
export const ACCOUNT_TREE_SETTLE_LIFT_DROP_MS = 180;
export const ACCOUNT_TREE_CHILD_INTENT_BORDER_WIDTH = 1.5;
export const ACCOUNT_TREE_INSERTION_SCALE_FROM = 0.92;
export const ACCOUNT_TREE_INSERTION_SCALE_DELTA = 0.08;
export const ACCOUNT_TREE_INSERTION_TERMINAL_SIZE = 8;
export const ACCOUNT_TREE_INSERTION_TERMINAL_OFFSET = 3;
export const ACCOUNT_TREE_DEPTH_INDENT = 22;
export const ACCOUNT_TREE_LAYOUT_EPSILON = 0.5;

/** Lift chrome — color from design tokens; offset/radius interpolate with lift progress. */
export const ACCOUNT_TREE_DRAG_LIFT_SHADOW = {
  color: DeepSpacePalette.black,
  offsetY: 8,
  radius: 16,
  elevation: Shape.elevation.lg.elevation,
} as const;

export function shouldDispatchAccountTreeDragUpdate(
  previous: { translationY: number; absoluteY: number } | null,
  next: { translationY: number; absoluteY: number },
): boolean {
  'worklet';
  return (
    previous == null ||
    Math.max(
      Math.abs(next.translationY - previous.translationY),
      Math.abs(next.absoluteY - previous.absoluteY),
    ) >= ACCOUNT_TREE_DRAG_UPDATE_MIN_DELTA
  );
}
