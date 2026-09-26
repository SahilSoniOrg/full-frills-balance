/**
 * Ledger Constants - Shared keys and sources for journals and metadata
 */

/** Maximum number of bulk journal rows that fits within the WatermelonDB bridge limit. */
export const MAX_BULK_JOURNAL_ROWS = 100;

export const MetadataKeys = {
  ORIGINAL_PLANNED_DATE: 'originalPlannedDate',
} as const;

export const MetadataSources = {
  MANUAL_POST: 'manual_post',
  IVY_IMPORT: 'ivy_import',
  SMS: 'sms',
} as const;
