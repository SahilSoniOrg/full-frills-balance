import React, { createContext, useCallback, useContext, useMemo, useRef } from 'react';
import { View } from 'react-native';

type ResetFn = (x?: number, y?: number) => void;

interface ChartInteractionContextValue {
  registerChart: (fn: ResetFn) => () => void;
  resetAllCharts: (pageX?: number, pageY?: number) => void;
  beginInteraction: (owner: symbol) => void;
  endInteraction: (owner: symbol) => void;
  isInteracting: () => boolean;
}

const ChartInteractionContext = createContext<ChartInteractionContextValue | null>(null);

export function ChartInteractionProvider({ children }: { children: React.ReactNode }) {
  const listenersRef = useRef(new Set<ResetFn>());
  const ownersRef = useRef(new Set<symbol>());

  const registerChart = useCallback((fn: ResetFn) => {
    listenersRef.current.add(fn);
    return () => {
      listenersRef.current.delete(fn);
    };
  }, []);

  const resetAllCharts = useCallback((pageX?: number, pageY?: number) => {
    listenersRef.current.forEach(listener => listener(pageX, pageY));
  }, []);

  const beginInteraction = useCallback((owner: symbol) => {
    ownersRef.current.add(owner);
  }, []);
  const endInteraction = useCallback((owner: symbol) => {
    ownersRef.current.delete(owner);
  }, []);

  const isInteracting = useCallback(() => ownersRef.current.size > 0, []);

  const value = useMemo(
    () => ({
      registerChart,
      resetAllCharts,
      beginInteraction,
      endInteraction,
      isInteracting,
    }),
    [registerChart, resetAllCharts, beginInteraction, endInteraction, isInteracting],
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
