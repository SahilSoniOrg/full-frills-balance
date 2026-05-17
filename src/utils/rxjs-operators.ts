import { Observable, timer, of } from 'rxjs';
import { debounce } from 'rxjs/operators';

/**
 * A debounce operator that emits the first value immediately (fast-path)
 * and subsequent values after the specified dueTime.
 *
 * This is ideal for initial data loading in UI screens where we want the
 * first database emission to hit the screen ASAP, but subsequent rapid
 * updates (e.g. during background synchronization) to be throttled.
 */
export function firstFastDebounce<T>(dueTime: number) {
  return (source: Observable<T>) => {
    let emissionCount = 0;
    return source.pipe(debounce(() => (emissionCount++ === 0 ? of(null) : timer(dueTime))));
  };
}
