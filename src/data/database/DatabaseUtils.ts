import { Database } from '@nozbe/watermelondb';

export type RawSqlArg = string | number | boolean | null;

/** Named seam for Watermelon JSI `unsafeQueryRaw`. Callers must not reach the private adapter. */
export interface RawSqlAdapter {
  queryRaw: (sql: string, args: RawSqlArg[], table?: string) => Promise<unknown>;
}

interface WatermelonJsiDispatcher {
  _db?: {
    unsafeQueryRaw?: (sql: string, args: RawSqlArg[]) => Promise<unknown>;
  };
}

interface WatermelonPrivateAdapter {
  underlyingAdapter?: WatermelonPrivateAdapter;
  _dispatcher?: WatermelonJsiDispatcher;
}

/**
 * Utility to safely access the underlying raw SQL adapter for WatermelonDB.
 */
export function getRawAdapter(database: Database): RawSqlAdapter | null {
  const adapter = database.adapter as WatermelonPrivateAdapter;
  const underlying = adapter.underlyingAdapter || adapter;
  const dispatcher = underlying?._dispatcher;
  const db = dispatcher?._db;

  if (db && typeof db.unsafeQueryRaw === 'function') {
    const unsafeQueryRaw = db.unsafeQueryRaw;
    return {
      queryRaw: async (sql: string, args: RawSqlArg[], _table?: string) => {
        return unsafeQueryRaw(sql, args);
      },
    };
  }

  return null;
}

/** Normalize JSI array results and SQLite `{ rows }` payloads. */
export function rowsFromQueryRaw(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === 'object' && 'rows' in result) {
    const rows = Reflect.get(result, 'rows');
    if (Array.isArray(rows)) return rows;
  }
  return [];
}

/**
 * Checks if the database adapter supports raw SQL queries.
 */
export function supportsRawSql(database: Database): boolean {
  return getRawAdapter(database) !== null;
}
