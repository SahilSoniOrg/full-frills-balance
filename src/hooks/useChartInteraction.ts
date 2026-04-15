import { registerChart } from '@/src/hooks/chartInteractionRegistry';
import { triggerHaptic } from '@/src/utils/haptics';
import { useCallback, useEffect, useRef } from 'react';
import { View } from 'react-native';

export type InteractionState =
  | { type: 'none' }
  | { type: 'index'; index: number }
  | { type: 'grid'; col: number; row: number };

interface UseChartInteractionProps {
  enabled?: boolean;
  hapticThrottleMs?: number;
  getInteractionFromTouch: (x: number, y: number) => InteractionState;
  onInteractionChange: (state: InteractionState) => void;
}

export const useChartInteraction = ({
  enabled = true,
  hapticThrottleMs = 50,
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
    (x: number, y: number = 0, phase: 'start' | 'update' | 'end' = 'update') => {
      if (!enabled) return;

      if (phase === 'start') {
        isInteractingRef.current = true;
      }

      if (phase === 'end') {
        isInteractingRef.current = false;
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

        if (state.type !== 'none') {
          throttledHaptic();
        }

        onInteractionChange(state);
      }
    },
    [enabled, getInteractionFromTouch, onInteractionChange, throttledHaptic],
  );
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
    resetInteraction,
  };
};
