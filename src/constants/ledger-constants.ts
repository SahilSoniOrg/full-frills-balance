/**
 * Ledger Constants - Shared keys and sources for journals and metadata
 */

export const MetadataKeys = {
  ORIGINAL_PLANNED_DATE: 'originalPlannedDate',
} as const;

export const MetadataSources = {
  MANUAL_POST: 'manual_post',
  IVY_IMPORT: 'ivy_import',
  SMS: 'sms',
} as const;
