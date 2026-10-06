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
