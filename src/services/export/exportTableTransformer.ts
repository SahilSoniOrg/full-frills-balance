import { database } from '@/src/data/database/Database';
import { supportsRawSql } from '@/src/data/database/DatabaseUtils';
import { exportRepository } from '@/src/data/repositories/ExportRepository';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { WorkplaceId } from '@/src/types/ids';
import { logger } from '@/src/utils/logger';
import {
  DATE_COLUMN_NAMES,
  EXPORT_OMIT_SOFT_DELETED_TABLES,
  getTableSchema,
  snakeToCamel,
  toIsoDate,
  typeSafeColumns,
} from './exportSchemaUtils';

/**
 * Universal fetch and transform helper derived from database schema.
 * Generates SQL with aliasing and handles value conversions centrally.
 */
export async function fetchAndTransformTable<T extends object>(
  workplaceId: WorkplaceId,
  tableName: string,
  onProgress?: (processed: number, total: number) => void,
): Promise<T[]> {
  const tableSchema = getTableSchema(tableName);
  if (!tableSchema) throw new Error(`Missing schema for table: ${tableName}`);

  const columns = typeSafeColumns(tableSchema);
  const columnNames = ['id', ...columns.map(column => column.name)];

  // Identify Boolean and Date fields from schema
  const booleanFields = columns
    .filter((col: { name: string; type: string }) => col.type === 'boolean')
    .map((col: { name: string; type: string }) => snakeToCamel(col.name));

  const dateFields = columns
    .filter(
      (col: { name: string; type: string }) =>
        col.type === 'number' && DATE_COLUMN_NAMES.includes(col.name),
    )
    .map((col: { name: string; type: string }) => snakeToCamel(col.name));

  let raws: Record<string, unknown>[] = [];
  let useFallback = true;
  const omitSoftDeleted =
    EXPORT_OMIT_SOFT_DELETED_TABLES.has(tableName) && columnNames.includes('deleted_at');

  if (supportsRawSql(database)) {
    const selectFields = columnNames.map(snake => `${snake} AS ${snakeToCamel(snake)}`).join(', ');
    const whereClauses: string[] = [];
    const params: (string | number)[] = [];
    if (columnNames.includes('workplace_id')) {
      whereClauses.push('workplace_id = ?');
      params.push(workplaceId);
    }
    if (omitSoftDeleted) {
      whereClauses.push('deleted_at IS NULL');
    }
    let sql = `SELECT ${selectFields} FROM ${tableName}`;
    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }
    const results = await transactionRawRepository.queryRaw<Record<string, unknown>>(
      sql,
      params,
      tableName,
    );
    if (results !== null) {
      raws = results;
      useFallback = false;
    }
  }

  if (useFallback) {
    logger.warn(
      `[ExportService] fetchAndTransformTable(${tableName}) falling back to ORM loop. Performance risk.`,
    );
    raws = await exportRepository.fetchOrmTable(tableName, columnNames, workplaceId);
  }

  if (omitSoftDeleted) {
    raws = raws.filter(raw => raw.deletedAt == null && raw.deleted_at == null);
  }

  const total = raws.length;
  return raws.map((raw, index) => {
    // Report sub-progress for large tables every 100 rows
    if (onProgress && index > 0 && index % 100 === 0) {
      onProgress(index, total);
    }

    const transformed = { ...raw } as Record<string, unknown>;

    // Convert date numbers to ISO strings
    dateFields.forEach((f: string) => {
      if (transformed[f] !== undefined) {
        transformed[f] = toIsoDate(transformed[f] as number);
      }
    });

    // Convert 1/0 numbers to booleans
    booleanFields.forEach((f: string) => {
      if (transformed[f] !== undefined) {
        transformed[f] = Boolean(transformed[f]);
      }
    });

    // Strictly filter to camelCase keys and exclude original snake_case names
    const cleaned: Record<string, unknown> = {};
    const targetKeys = columnNames.map(snakeToCamel);

    for (const key of targetKeys) {
      if (transformed[key] !== undefined) {
        cleaned[key] = transformed[key];
      }
    }

    return cleaned as T;
  });
}
