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

let globalIsInteracting = false;
let globalLastActiveState: string | null = null;

export const useChartInteraction = ({
  enabled = true,
  hapticThrottleMs = 50,
  gestureConfig = { type: 'exclusive' },
  getInteractionFromTouch,
  onInteractionChange,
}: UseChartInteractionProps) => {
  const chartRef = useMemo(() => ({ current: null as View | null }), []);
  const layoutRef = useMemo(() => ({ current: { pageX: 0, pageY: 0, width: 0, height: 0 } }), []);

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
  }, [chartRef, layoutRef]);

  const handleGesture = useCallback(
    (x: number, y: number = 0, phase: 'start' | 'update' | 'end' | 'cancel' = 'update') => {
      if (!enabled) return;

      if (phase === 'start') {
        globalIsInteracting = true;
      }

      const isEnding = phase === 'end' || phase === 'cancel';
      if (isEnding) {
        globalIsInteracting = false;
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

      if (stateKey !== globalLastActiveState) {
        globalLastActiveState = stateKey;

        if (state.type !== 'none' && !isEnding) {
          throttledHaptic();
        }

        onInteractionChange(state);
      }
    },
    [enabled, getInteractionFromTouch, onInteractionChange, throttledHaptic],
  );

  const onPanBegin = useCallback(
    (e: any) => {
      'worklet';
      runOnJS(handleGesture)(e.x, e.y, 'start');
    },
    [handleGesture],
  );
  const onPanUpdate = useCallback(
    (e: any) => {
      'worklet';
      runOnJS(handleGesture)(e.x, e.y, 'update');
    },
    [handleGesture],
  );
  const onPanFinalize = useCallback(
    (e: any, success: boolean) => {
      'worklet';
      runOnJS(handleGesture)(e.x, e.y, success ? 'end' : 'cancel');
    },
    [handleGesture],
  );
  const onTapBegin = useCallback(
    (e: any) => {
      'worklet';
      runOnJS(handleGesture)(e.x, e.y, 'start');
    },
    [handleGesture],
  );
  const onTapFinalize = useCallback(
    (e: any, success: boolean) => {
      'worklet';
      runOnJS(handleGesture)(e.x, e.y, success ? 'end' : 'cancel');
    },
    [handleGesture],
  );

  const assignCb = (g: any, m: string, cb: any) => g[m](cb);
  const gesture = useMemo(() => {
    const pan = Gesture.Pan();
    // eslint-disable-next-line react-hooks/refs
    assignCb(pan, 'onBegin', onPanBegin);
    // eslint-disable-next-line react-hooks/refs
    assignCb(pan, 'onUpdate', onPanUpdate);
    // eslint-disable-next-line react-hooks/refs
    assignCb(pan, 'onFinalize', onPanFinalize);
    if (gestureConfig.activeOffsetX !== undefined) pan.activeOffsetX(gestureConfig.activeOffsetX);
    if (gestureConfig.activateAfterLongPress !== undefined)
      pan.activateAfterLongPress(gestureConfig.activateAfterLongPress);

    const tap = Gesture.Tap();
    // eslint-disable-next-line react-hooks/refs
    assignCb(tap, 'onBegin', onTapBegin);
    // eslint-disable-next-line react-hooks/refs
    assignCb(tap, 'onFinalize', onTapFinalize);

    return gestureConfig.type === 'simultaneous'
      ? Gesture.Simultaneous(pan, tap)
      : Gesture.Exclusive(pan, tap);
  }, [
    onPanBegin,
    onPanUpdate,
    onPanFinalize,
    onTapBegin,
    onTapFinalize,
    gestureConfig.activeOffsetX,
    gestureConfig.activateAfterLongPress,
    gestureConfig.type,
  ]);

  const resetInteraction = useCallback(
    (x?: number, y?: number) => {
      if (globalIsInteracting) return;

      if (x !== undefined && y !== undefined) {
        const { pageX, pageY, width, height } = layoutRef.current;

        const isInside = x >= pageX && x <= pageX + width && y >= pageY && y <= pageY + height;

        if (isInside) return; // 🚫 DO NOTHING if touch is inside chart
      }

      globalLastActiveState = null;
      onInteractionChange({ type: 'none' });
    },
    [onInteractionChange, layoutRef],
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
