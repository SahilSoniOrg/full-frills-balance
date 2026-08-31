import { Database } from '@nozbe/watermelondb';

export type RawSqlArg = string | number | boolean | null;

/** Named seam for Watermelon raw SQL. Callers must not reach private adapter internals. */
export interface RawSqlAdapter {
  queryRaw: (sql: string, args: RawSqlArg[], table?: string) => Promise<unknown>;
  executeRawBatch?: (statements: [string, RawSqlArg[]][]) => Promise<void>;
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
    const rawAdapter: RawSqlAdapter = {
      queryRaw: async (sql: string, args: RawSqlArg[], _table?: string) => {
        return unsafeQueryRaw(sql, args);
      },
    };
    const execute = (
      database.adapter as unknown as {
        unsafeExecute?: (operations: { sqls: [string, RawSqlArg[]][] }) => Promise<void>;
      }
    ).unsafeExecute;
    if (execute) {
      rawAdapter.executeRawBatch = async (statements: [string, RawSqlArg[]][]) => {
        await execute.call(database.adapter, { sqls: statements });
      };
    }
    return rawAdapter;
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
