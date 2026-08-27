import { schema } from '@/src/data/database/schema';
import { TableSchema } from '@nozbe/watermelondb';
import { AppSchema } from '@nozbe/watermelondb/Schema';

export { snakeToCamel } from '@/src/utils/stringUtils';

export const DATE_COLUMN_NAMES = [
  'created_at',
  'updated_at',
  'deleted_at',
  'journal_date',
  'transaction_date',
  'reconciled_at',
  'archived_at',
  'start_date',
  'end_date',
  'next_occurrence',
  'effective_date',
];

/**
 * Soft-deleted journal legs (and whole journals) are edit debris. Including them in
 * backups reintroduces orphan account FKs after restores. Active state only.
 */
export const EXPORT_OMIT_SOFT_DELETED_TABLES = new Set(['transactions', 'journals']);

export function toIsoDate(value: Date | number | undefined | null): string | undefined {
  if (value === undefined || value === null) return undefined;
  const date = typeof value === 'number' ? new Date(value) : value;
  return date.toISOString();
}

export function typeSafeColumns(tableSchema: TableSchema): { name: string; type: string }[] {
  const rawColumns = Array.isArray(tableSchema?.columns)
    ? tableSchema.columns
    : Object.values(tableSchema?.columns || {});
  return rawColumns as { name: string; type: string }[];
}

export function getTableSchema(tableName: string): TableSchema | undefined {
  const tables = (schema as unknown as AppSchema).tables;
  if (Array.isArray(tables)) {
    return (tables as TableSchema[]).find(table => table.name === tableName);
  }
  if (tables && typeof tables === 'object') {
    const tableRecord = tables as unknown as Record<string, TableSchema>;
    if (tableRecord[tableName]) return tableRecord[tableName];
    return Object.values(tableRecord).find(table => table.name === tableName);
  }
  return undefined;
}
