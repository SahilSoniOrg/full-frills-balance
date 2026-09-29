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
