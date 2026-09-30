import { take } from 'rxjs/operators';
import { observeForecastDateBasis, type ForecastDateBasisDependencies } from '../forecastDateBasis';

describe('observeForecastDateBasis', () => {
  it('reschedules one midnight timer on repeated foreground and clears it on unsubscribe', () => {
    let now = new Date(2026, 8, 30, 23, 50).getTime();
    let foreground: (() => void) | undefined;
    let nextTimer = 0;
    const timers = new Map<number, () => void>();
    const dependencies: ForecastDateBasisDependencies = {
      now: () => now,
      setTimer: callback => {
        const id = ++nextTimer;
        timers.set(id, callback);
        return id as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimer: timer => {
        timers.delete(timer as unknown as number);
      },
      observeForeground: listener => {
        foreground = listener;
        return () => {
          foreground = undefined;
        };
      },
    };
    const values: number[] = [];
    const subscription = observeForecastDateBasis(dependencies).subscribe(value =>
      values.push(value.startOfToday),
    );

    expect(timers.size).toBe(1);
    now += 15 * 60 * 1000;
    foreground?.();
    foreground?.();
    expect(timers.size).toBe(1);
    expect(values).toHaveLength(3);

    now = new Date(2026, 9, 1, 0, 10).getTime();
    foreground?.();
    expect(values[3]).toBe(new Date(2026, 9, 1).getTime());
    expect(timers.size).toBe(1);

    subscription.unsubscribe();
    expect(timers.size).toBe(0);
    expect(foreground).toBeUndefined();
  });

  it('does not schedule a timer when a synchronous consumer takes only the initial basis', () => {
    const timers = new Map<number, () => void>();
    const dependencies: ForecastDateBasisDependencies = {
      now: () => new Date(2026, 8, 30, 12).getTime(),
      setTimer: callback => {
        const id = timers.size + 1;
        timers.set(id, callback);
        return id as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimer: timer => timers.delete(timer as unknown as number),
      observeForeground: () => () => undefined,
    };

    observeForecastDateBasis(dependencies).pipe(take(1)).subscribe();
    expect(timers.size).toBe(0);
  });
});
