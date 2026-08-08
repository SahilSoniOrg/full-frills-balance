import { AccountAuditState } from '@/src/types/domain';

/** Persisted shape written to audit_logs.changes for archive mutations. */
export type PersistedArchiveAuditChanges = {
  before: { archivedAt: string | null };
  after: { archivedAt: string | null; action: 'ARCHIVED' | 'UNARCHIVED' };
};

export function toPersistedIsoDate(value: Date | null | undefined): string | null {
  if (value == null) return null;
  return value.toISOString();
}

/** Lenient parse for non-archive audit fields (undefined when unparseable). */
export function parsePersistedAuditDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
  return undefined;
}

/** Strict parse for archive revert — invalid persisted values must fail the revert. */
export function parsePersistedArchivedAtStrict(value: unknown): Date | null {
  if (value === null) return null;
  if (value === undefined) {
    throw new Error('Invalid archivedAt in audit snapshot: expected ISO string or null');
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error('Invalid archivedAt in audit snapshot: Date is NaN');
    }
    return value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`Invalid archivedAt in audit snapshot: ${String(value)}`);
    }
    return parsed;
  }
  throw new Error(`Invalid archivedAt in audit snapshot: unexpected type ${typeof value}`);
}

/**
 * Normalize a persisted audit `before` snapshot for revert.
 * `archivedAt` is strict (invalid values fail); `deletedAt` stays lenient.
 */
export function normalizeAccountAuditState(
  before: AccountAuditState | Record<string, unknown>,
): AccountAuditState {
  const raw = before as Record<string, unknown>;
  const normalized = { ...before } as AccountAuditState;

  if ('deletedAt' in raw) {
    normalized.deletedAt = parsePersistedAuditDate(raw.deletedAt) ?? undefined;
  }
  if ('archivedAt' in raw) {
    normalized.archivedAt = parsePersistedArchivedAtStrict(raw.archivedAt);
  }

  return normalized;
}
