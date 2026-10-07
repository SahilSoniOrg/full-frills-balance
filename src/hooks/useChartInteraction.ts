import { useChartInteractionRegistry } from '@/src/components/charts/ChartInteractionProvider';
import {
  CHART_DRAG_ACTIVATION_DISTANCE,
  CHART_SCROLL_FAILURE_DISTANCE,
  CHART_SCRUB_HOLD_MS,
  CHART_TAP_MAX_DISTANCE,
} from '@/src/constants/gesture-constants';
import { triggerHaptic } from '@/src/utils/haptics';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

export type InteractionState =
  { type: 'none' } | { type: 'index'; index: number } | { type: 'grid'; col: number; row: number };

interface UseChartInteractionProps {
  enabled?: boolean;
  hapticThrottleMs?: number;
  /** Horizontal scrubbing yields to vertical scroll; a hold permits scrubbing in both axes. */
  panActivation?: 'horizontal' | 'hold';
  getInteractionFromTouch: (x: number, y: number) => InteractionState;
  onInteractionChange: (state: InteractionState) => void;
}

function stateKey(state: InteractionState): string {
  return state.type === 'none'
    ? 'none'
    : state.type === 'index'
      ? `index:${state.index}`
      : `grid:${state.col}:${state.row}`;
}

export function useChartInteraction({
  enabled = true,
  hapticThrottleMs = 50,
  panActivation = 'horizontal',
  getInteractionFromTouch,
  onInteractionChange,
}: UseChartInteractionProps) {
  const { registerChart, beginInteraction, endInteraction, isInteracting } =
    useChartInteractionRegistry();
  const chartRef = useRef<View>(null);
  const owner = useMemo(() => Symbol('chart-pan'), []);
  const selectionRef = useRef<InteractionState>({ type: 'none' });
  const priorSelectionRef = useRef<InteractionState | null>(null);
  const versionRef = useRef(0);
  const resetRequestRef = useRef(0);
  const mountedRef = useRef(true);
  const lastHapticTime = useRef(0);
  const callbacksRef = useRef({ getInteractionFromTouch, onInteractionChange, enabled });

  useEffect(() => {
    callbacksRef.current = { getInteractionFromTouch, onInteractionChange, enabled };
  }, [enabled, getInteractionFromTouch, onInteractionChange]);

  const select = useCallback(
    (state: InteractionState, haptic = true) => {
      if (stateKey(state) === stateKey(selectionRef.current)) return;
      selectionRef.current = state;
      versionRef.current += 1;
      if (
        haptic &&
        state.type !== 'none' &&
        Date.now() - lastHapticTime.current > hapticThrottleMs
      ) {
        lastHapticTime.current = Date.now();
        void triggerHaptic('light');
      }
      callbacksRef.current.onInteractionChange(state);
    },
    [hapticThrottleMs],
  );

  const startPan = useCallback(
    (x: number, y: number) => {
      if (!callbacksRef.current.enabled || priorSelectionRef.current !== null) return;
      priorSelectionRef.current = selectionRef.current;
      versionRef.current += 1;
      beginInteraction(owner);
      select(callbacksRef.current.getInteractionFromTouch(x, y));
    },
    [beginInteraction, owner, select],
  );

  const updatePan = useCallback(
    (x: number, y: number) => {
      if (priorSelectionRef.current === null || !callbacksRef.current.enabled) return;
      select(callbacksRef.current.getInteractionFromTouch(x, y));
    },
    [select],
  );

  const finishPan = useCallback(
    (x: number, y: number, success: boolean) => {
      const prior = priorSelectionRef.current;
      if (prior === null) return; // Failed recognition never owned or changed selection.
      priorSelectionRef.current = null;
      versionRef.current += 1;
      try {
        select(success ? callbacksRef.current.getInteractionFromTouch(x, y) : prior, success);
      } finally {
        endInteraction(owner);
      }
    },
    [endInteraction, owner, select],
  );

  const selectTap = useCallback(
    (x: number, y: number, success: boolean) => {
      if (!success || !callbacksRef.current.enabled || priorSelectionRef.current !== null) return;
      versionRef.current += 1;
      select(callbacksRef.current.getInteractionFromTouch(x, y));
    },
    [select],
  );

  const gesture = useMemo(() => {
    // Gesture Handler registers these callbacks; it does not invoke them during render.
    /* eslint-disable react-hooks/refs */
    const pan = Gesture.Pan()
      .enabled(enabled)
      .maxPointers(1)
      .onStart(event => {
        'worklet';
        runOnJS(startPan)(event.x, event.y);
      })
      .onUpdate(event => {
        'worklet';
        runOnJS(updatePan)(event.x, event.y);
      })
      .onFinalize((event, success) => {
        'worklet';
        runOnJS(finishPan)(event.x, event.y, success);
      });
    if (panActivation === 'hold') pan.activateAfterLongPress(CHART_SCRUB_HOLD_MS);
    else
      pan
        .activeOffsetX([-CHART_DRAG_ACTIVATION_DISTANCE, CHART_DRAG_ACTIVATION_DISTANCE])
        .failOffsetY([-CHART_SCROLL_FAILURE_DISTANCE, CHART_SCROLL_FAILURE_DISTANCE]);

    const tap = Gesture.Tap()
      .enabled(enabled)
      .maxDistance(CHART_TAP_MAX_DISTANCE)
      .onEnd((event, success) => {
        'worklet';
        runOnJS(selectTap)(event.x, event.y, success);
      });
    return Gesture.Exclusive(pan, tap);
    /* eslint-enable react-hooks/refs */
  }, [enabled, finishPan, panActivation, selectTap, startPan, updatePan]);

  const resetInteraction = useCallback(
    (x?: number, y?: number) => {
      if (isInteracting() || selectionRef.current.type === 'none') return;
      const request = ++resetRequestRef.current;
      const version = versionRef.current;
      if (x === undefined || y === undefined) {
        select({ type: 'none' }, false);
        return;
      }
      // Absolute bounds change when an ancestor scrolls even without a new onLayout.
      chartRef.current?.measure((_x, _y, width, height, pageX, pageY) => {
        if (
          !mountedRef.current ||
          request !== resetRequestRef.current ||
          version !== versionRef.current ||
          isInteracting()
        )
          return;
        if (x >= pageX && x <= pageX + width && y >= pageY && y <= pageY + height) return;
        select({ type: 'none' }, false);
      });
    },
    [isInteracting, select],
  );

  useEffect(() => {
    if (!enabled) {
      priorSelectionRef.current = null;
      versionRef.current += 1;
      endInteraction(owner);
      select({ type: 'none' }, false);
      return;
    }
    return registerChart(resetInteraction);
  }, [enabled, endInteraction, owner, registerChart, resetInteraction, select]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      resetRequestRef.current += 1;
      priorSelectionRef.current = null;
      endInteraction(owner);
    };
  }, [endInteraction, owner]);

  return { chartRef, gesture, resetInteraction };
}
