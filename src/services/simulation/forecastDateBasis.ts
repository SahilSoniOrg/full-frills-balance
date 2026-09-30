import { AppState, AppStateStatus } from 'react-native';
import dayjs from 'dayjs';
import { Observable } from 'rxjs';

export interface ForecastDateBasis {
  /** One captured wall-clock instant shared by every query and calculation. */
  readonly asOf: number;
  readonly startOfToday: number;
}

export interface ForecastDateBasisDependencies {
  now: () => number;
  setTimer: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimer: (timer: ReturnType<typeof setTimeout>) => void;
  observeForeground: (listener: () => void) => () => void;
}

const productionDependencies: ForecastDateBasisDependencies = {
  now: () => Date.now(),
  setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimer: timer => clearTimeout(timer),
  observeForeground: listener => {
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (previous !== 'active' && next === 'active') listener();
      previous = next;
    });
    return () => subscription.remove();
  },
};

/**
 * Emits immediately, at local midnight and on foreground resume. Same-day resumes also
 * retry failed acquisitions and refresh their cutoff; teardown owns its single timer.
 */
export function observeForecastDateBasis(
  dependencies: ForecastDateBasisDependencies = productionDependencies,
): Observable<ForecastDateBasis> {
  return new Observable(subscriber => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    const emitAndSchedule = () => {
      if (disposed) return;
      if (timer !== undefined) {
        dependencies.clearTimer(timer);
        timer = undefined;
      }
      const asOf = dependencies.now();
      const startOfToday = dayjs(asOf).startOf('day').valueOf();
      subscriber.next({ asOf, startOfToday });
      if (disposed) return;
      const nextMidnight = dayjs(asOf).add(1, 'day').startOf('day').valueOf();
      timer = dependencies.setTimer(emitAndSchedule, Math.max(1, nextMidnight - asOf + 5));
    };

    const unsubscribeForeground = dependencies.observeForeground(emitAndSchedule);
    emitAndSchedule();

    return () => {
      disposed = true;
      if (timer !== undefined) dependencies.clearTimer(timer);
      unsubscribeForeground();
    };
  });
}
