import { firstValueFrom, type Observable } from 'rxjs';
import { skip, tap, timeout } from 'rxjs/operators';

export function observeAfterInitial<T>(source: Observable<T>, timeoutMs = 2000) {
  let markInitial!: () => void;
  const initial = new Promise<void>(resolve => {
    markInitial = resolve;
  });
  const nextValue = firstValueFrom(
    source.pipe(tap(markInitial), skip(1), timeout({ first: timeoutMs })),
  );
  return { initial, nextValue };
}

export async function expectObserveEmitsAfterUpdate<T>(
  source: Observable<T>,
  applyUpdate: () => Promise<void>,
  expected: T,
): Promise<void> {
  const observed = observeAfterInitial(source);
  await observed.initial;
  await applyUpdate();
  await expect(observed.nextValue).resolves.toBe(expected);
}
