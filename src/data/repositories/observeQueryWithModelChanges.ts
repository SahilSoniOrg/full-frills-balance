import type { Model, Query } from '@nozbe/watermelondb';
import { combineLatest, of, type Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';

/** Observe query membership/order and every field change on its current records. */
export function observeQueryWithModelChanges<T extends Model>(query: Query<T>): Observable<T[]> {
  return query
    .observe()
    .pipe(
      switchMap(records =>
        records.length > 0 ? combineLatest(records.map(record => record.observe())) : of(records),
      ),
    );
}
