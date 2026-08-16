import { Observable, Subject } from 'rxjs';

import { createDisposableReplay } from '@/src/services/reactive/disposableReplay';

describe('createDisposableReplay', () => {
  it('keeps a warmed source alive until disposal and then prevents reconnection', () => {
    const values = new Subject<number>();
    const sourceTeardown = jest.fn();
    const source = new Observable<number>(subscriber => {
      const subscription = values.subscribe(subscriber);
      return () => {
        subscription.unsubscribe();
        sourceTeardown();
      };
    });
    const replay = createDisposableReplay(source);
    const firstValues: number[] = [];
    const first = replay.observable.subscribe(value => firstValues.push(value));

    values.next(1);
    first.unsubscribe();

    const secondValues: number[] = [];
    const completed = jest.fn();
    replay.observable.subscribe({
      next: value => secondValues.push(value),
      complete: completed,
    });

    expect(firstValues).toEqual([1]);
    expect(secondValues).toEqual([1]);
    expect(sourceTeardown).not.toHaveBeenCalled();

    replay.dispose();
    values.next(2);

    expect(sourceTeardown).toHaveBeenCalledTimes(1);
    expect(secondValues).toEqual([1]);
    expect(completed).toHaveBeenCalledTimes(1);

    const lateValues: number[] = [];
    replay.observable.subscribe(value => lateValues.push(value));
    expect(lateValues).toEqual([]);
    expect(sourceTeardown).toHaveBeenCalledTimes(1);
  });
});
