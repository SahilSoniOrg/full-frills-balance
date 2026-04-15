type ResetFn = (x?: number, y?: number) => void;

const listeners = new Set<ResetFn>();

export const registerChart = (fn: ResetFn) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export const resetAllCharts = (pageX?: number, pageY?: number) => {
  listeners.forEach(listener => listener(pageX, pageY));
};
