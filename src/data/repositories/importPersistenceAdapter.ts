import { Model } from '@nozbe/watermelondb';

/**
 * Watermelon `_raw` columns used during import batch insert / sync.
 * Confined here so ImportRepository stays free of `any`.
 */
export type ImportPersistenceRaw = Record<string, unknown> & {
  id?: string;
  created_at?: number;
  updated_at?: number;
  deleted_at?: number | null;
  _status?: string;
};

export function getImportPersistenceRaw(record: Model): ImportPersistenceRaw {
  return record._raw as ImportPersistenceRaw;
}

export function setRecordTimestamps(
  record: Model,
  timestamps: { createdAt?: number; updatedAt?: number; deletedAt?: number | null },
): void {
  const raw = getImportPersistenceRaw(record);
  if (timestamps.createdAt !== undefined) raw.created_at = timestamps.createdAt;
  if (timestamps.updatedAt !== undefined) raw.updated_at = timestamps.updatedAt;
  if (timestamps.deletedAt !== undefined) raw.deleted_at = timestamps.deletedAt;
}

export function setImportPersistenceRawField(record: Model, field: string, value: unknown): void {
  getImportPersistenceRaw(record)[field] = value;
}
