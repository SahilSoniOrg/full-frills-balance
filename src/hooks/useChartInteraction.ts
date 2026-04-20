import { registerChart } from '@/src/hooks/chartInteractionRegistry';
import { triggerHaptic } from '@/src/utils/haptics';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

export type InteractionState =
  | { type: 'none' }
  | { type: 'index'; index: number }
  | { type: 'grid'; col: number; row: number };

interface GestureConfig {
  /**
   * Composition type for pan and tap gestures.
   * - 'exclusive': Only one gesture can be active (usually pan takes precedence).
   * - 'simultaneous': Both gestures can be active together.
   * @default 'exclusive'
   */
  type?: 'exclusive' | 'simultaneous';
  /**
   * Horizontal offset sensitivity. If set, pan will only activate after this distance.
   * Useful for charts inside paginated HorizontalScrollViews.
   */
  activeOffsetX?: number | [number, number];
  /**
   * Delay before pan gesture activates.
   * Useful for charts inside vertical ScrollViews to prevent accidental scrubbing.
   */
  activateAfterLongPress?: number;
}

interface UseChartInteractionProps {
  enabled?: boolean;
  hapticThrottleMs?: number;
  gestureConfig?: GestureConfig;
  getInteractionFromTouch: (x: number, y: number) => InteractionState;
  onInteractionChange: (state: InteractionState) => void;
}

export const useChartInteraction = ({
  enabled = true,
  hapticThrottleMs = 50,
  gestureConfig = { type: 'exclusive' },
  getInteractionFromTouch,
  onInteractionChange,
}: UseChartInteractionProps) => {
  const chartRef = useRef<View>(null);
  const layoutRef = useRef({ pageX: 0, pageY: 0, width: 0, height: 0 });
  const lastActiveState = useRef<string | null>(null);
  const lastHapticTime = useRef(0);

  const throttledHaptic = useCallback(() => {
    const now = Date.now();
    if (now - lastHapticTime.current > hapticThrottleMs) {
      triggerHaptic('light');
      lastHapticTime.current = now;
    }
  }, [hapticThrottleMs]);

  const onLayout = useCallback(() => {
    chartRef.current?.measure((_x, _y, width, height, pageX, pageY) => {
      layoutRef.current = { pageX, pageY, width, height };
    });
  }, []);

  const isInteractingRef = useRef(false);

  const handleGesture = useCallback(
    (x: number, y: number = 0, phase: 'start' | 'update' | 'end' | 'cancel' = 'update') => {
      if (!enabled) return;

      if (phase === 'start') {
        isInteractingRef.current = true;
      }

      const isEnding = phase === 'end' || phase === 'cancel';
      if (isEnding) {
        isInteractingRef.current = false;
        // 🎯 STICKY BEHAVIOR:
        // We release the lock so global taps can reset the chart,
        // but we don't clear the selection ourselves.
        return;
      }

      const state = getInteractionFromTouch(x, y);

      const stateKey =
        state.type === 'none'
          ? 'n'
          : state.type === 'index'
            ? `i:${state.index}`
            : `g:${state.col}_${state.row}`;

      if (stateKey !== lastActiveState.current) {
        lastActiveState.current = stateKey;

        if (state.type !== 'none' && !isEnding) {
          throttledHaptic();
        }

        onInteractionChange(state);
      }
    },
    [enabled, getInteractionFromTouch, onInteractionChange, throttledHaptic],
  );

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .onBegin(e => runOnJS(handleGesture)(e.x, e.y, 'start'))
      .onUpdate(e => runOnJS(handleGesture)(e.x, e.y, 'update'))
      .onFinalize((e, success) => runOnJS(handleGesture)(e.x, e.y, success ? 'end' : 'cancel'));

    if (gestureConfig.activeOffsetX !== undefined) {
      const val = gestureConfig.activeOffsetX;
      pan.activeOffsetX(Array.isArray(val) ? val : [-val, val]);
    }

    if (gestureConfig.activateAfterLongPress !== undefined) {
      pan.activateAfterLongPress(gestureConfig.activateAfterLongPress);
    }

    const tap = Gesture.Tap()
      .onBegin(e => runOnJS(handleGesture)(e.x, e.y, 'start'))
      .onFinalize((e, success) => runOnJS(handleGesture)(e.x, e.y, success ? 'end' : 'cancel'));

    return gestureConfig.type === 'simultaneous'
      ? Gesture.Simultaneous(pan, tap)
      : Gesture.Exclusive(pan, tap);
  }, [
    handleGesture,
    gestureConfig.activeOffsetX,
    gestureConfig.activateAfterLongPress,
    gestureConfig.type,
  ]);

  const resetInteraction = useCallback(
    (x?: number, y?: number) => {
      if (isInteractingRef.current) return;

      if (x !== undefined && y !== undefined) {
        const { pageX, pageY, width, height } = layoutRef.current;

        const isInside = x >= pageX && x <= pageX + width && y >= pageY && y <= pageY + height;

        if (isInside) return; // 🚫 DO NOTHING if touch is inside chart
      }

      lastActiveState.current = null;
      onInteractionChange({ type: 'none' });
    },
    [onInteractionChange],
  );

  useEffect(() => {
    if (!enabled) return;
    return registerChart(resetInteraction);
  }, [enabled, resetInteraction]);

  return {
    chartRef,
    onLayout,
    handleGesture,
    gesture,
    resetInteraction,
  };
};
