import React, { createContext, useCallback, useContext, useMemo, useRef } from 'react';
import { View } from 'react-native';

type ResetFn = (x?: number, y?: number) => void;

interface ChartInteractionContextValue {
  registerChart: (fn: ResetFn) => () => void;
  resetAllCharts: (pageX?: number, pageY?: number) => void;
  setIsInteracting: (value: boolean) => void;
  isInteracting: () => boolean;
}

const ChartInteractionContext = createContext<ChartInteractionContextValue | null>(null);

export function ChartInteractionProvider({ children }: { children: React.ReactNode }) {
  const listenersRef = useRef(new Set<ResetFn>());
  const isInteractingRef = useRef(false);

  const registerChart = useCallback((fn: ResetFn) => {
    listenersRef.current.add(fn);
    return () => {
      listenersRef.current.delete(fn);
    };
  }, []);

  const resetAllCharts = useCallback((pageX?: number, pageY?: number) => {
    listenersRef.current.forEach(listener => listener(pageX, pageY));
  }, []);

  const setIsInteracting = useCallback((value: boolean) => {
    isInteractingRef.current = value;
  }, []);

  const isInteracting = useCallback(() => isInteractingRef.current, []);

  const value = useMemo(
    () => ({
      registerChart,
      resetAllCharts,
      setIsInteracting,
      isInteracting,
    }),
    [registerChart, resetAllCharts, setIsInteracting, isInteracting],
  );

  return (
    <ChartInteractionContext.Provider value={value}>
      <View
        style={{ flex: 1 }}
        onStartShouldSetResponderCapture={e => {
          resetAllCharts(e.nativeEvent.pageX, e.nativeEvent.pageY);
          return false;
        }}
      >
        {children}
      </View>
    </ChartInteractionContext.Provider>
  );
}

export function useChartInteractionRegistry(): ChartInteractionContextValue {
  const ctx = useContext(ChartInteractionContext);
  if (!ctx) {
    throw new Error('useChartInteractionRegistry must be used within ChartInteractionProvider');
  }
  return ctx;
}
