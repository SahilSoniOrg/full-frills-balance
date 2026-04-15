import { Database } from '@nozbe/watermelondb';

/**
 * Utility to safely access the underlying raw SQL adapter for WatermelonDB.
 */
export function getRawAdapter(database: Database): any {
  const adapter = database.adapter as any;
  const underlying = adapter.underlyingAdapter || adapter;
  const dispatcher = underlying?._dispatcher;
  const db = dispatcher?._db;

  /**
   * GOD MODE BRIDGE
   * Diagnostics confirm the JSI dispatcher has a native _db object
   * with a direct unsafeQueryRaw method.
   */
  if (db && typeof db.unsafeQueryRaw === 'function') {
    return {
      queryRaw: async (sql: string, args: any[]) => {
        // DIRECT native call: discrete (sql, args)
        return db.unsafeQueryRaw(sql, args);
      },
    };
  }

  return null;
}

/**
 * Checks if the database adapter supports raw SQL queries.
 */
export function supportsRawSql(database: Database): boolean {
  const adapter = getRawAdapter(database);
  return (
    adapter &&
    (typeof adapter.queryRaw === 'function' || typeof adapter.unsafeQueryRaw === 'function')
  );
}
