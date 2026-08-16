import { Observable, ReplaySubject, Subscription } from 'rxjs';

export interface DisposableReplay<T> {
  observable: Observable<T>;
  dispose: () => void;
}

/**
 * Keeps the latest source value hot until its owner explicitly disposes it.
 * Unlike shareReplay({ refCount: false }), ownership is not hidden inside an
 * operator, so cache eviction can tear down database observers and timers.
 */
export function createDisposableReplay<T>(source: Observable<T>): DisposableReplay<T> {
  let replay = new ReplaySubject<T>(1);
  let sourceSubscription: Subscription | null = null;
  let disposed = false;

  const observable = new Observable<T>(subscriber => {
    const replaySubscription = replay.subscribe(subscriber);

    if (!disposed && sourceSubscription === null) {
      sourceSubscription = source.subscribe(replay);
    }

    return () => replaySubscription.unsubscribe();
  });

  return {
    observable,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      sourceSubscription?.unsubscribe();
      sourceSubscription = null;
      replay.complete();
      replay = new ReplaySubject<T>(1);
      replay.complete();
    },
  };
}
