import { Database } from '@nozbe/watermelondb';

/**
 * Utility to safely access the underlying raw SQL adapter for WatermelonDB.
 */
export function getRawAdapter(database: Database): any {
    const adapter = database.adapter as any;
    if (!adapter) return null;
    // On native, we want the underlying SQLiteAdapter or similar that has queryRaw
    return adapter.underlyingAdapter || adapter;
}

/**
 * Checks if the database adapter supports raw SQL queries.
 */
export function supportsRawSql(database: Database): boolean {
    const adapter = getRawAdapter(database);
    return adapter && typeof adapter.queryRaw === 'function';
}
