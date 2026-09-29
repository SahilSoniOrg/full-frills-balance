import { database } from '@/src/data/database/Database';
import { getRawAdapter, rowsFromQueryRaw, type RawSqlArg } from '../../database/DatabaseUtils';
import { logger } from '@/src/utils/logger';

/** Narrow adapter seam for raw reads. SQL and row types remain with feature queries. */
export class RawSqlExecutor {
  private readonly keyCache = new Map<string, string>();
  private readonly mappingCache = new Map<string, { original: string; camel: string }[]>();

  private toCamelCase(value: string): string {
    const cached = this.keyCache.get(value);
    if (cached) return cached;
    const result = value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
    this.keyCache.set(value, result);
    return result;
  }

  async query<T>(sql: string, args: RawSqlArg[] = []): Promise<T[] | null> {
    const adapter = getRawAdapter(database);
    if (!adapter) return null;

    try {
      const rows = rowsFromQueryRaw(await adapter.queryRaw(sql, args));
      if (rows.length === 0) return [];

      const sample = rows[0];
      if (!sample || typeof sample !== 'object') return [];
      const keys = Object.keys(sample);
      const schemaSignature = keys.join('|');
      let mapping = this.mappingCache.get(schemaSignature);
      if (!mapping) {
        mapping = keys.map(original => ({
          original,
          camel: this.toCamelCase(original.toLowerCase()),
        }));
        this.mappingCache.set(schemaSignature, mapping);
      }

      return rows.map(raw => {
        const row = raw as Record<string, unknown>;
        const normalized: Record<string, unknown> = {};
        for (const { original, camel } of mapping) {
          const value = row[original];
          normalized[original] = value;
          if (original !== camel) normalized[camel] = value;
        }
        return normalized as T;
      });
    } catch (error) {
      logger.error('[RawSqlExecutor] query failed', { error });
      throw error;
    }
  }
}

export const rawSqlExecutor = new RawSqlExecutor();
