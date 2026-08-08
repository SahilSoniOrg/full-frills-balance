import Account from '@/src/data/models/Account';
import { analytics } from '@/src/services/analytics-service';
import { AccountArchiveChanges } from '@/src/utils/accountArchive';
import { AccountId } from '@/src/types/domain';

export type ArchiveAuditEntry = {
  entityId: string;
  beforeArchivedAt?: Date;
  afterArchivedAt?: Date;
  action: 'ARCHIVED' | 'UNARCHIVED';
};

export type ArchiveMutationPlan = {
  archiveTargets: Account[];
  unarchiveTargets: Account[];
  now: Date;
};

export function partitionArchiveTargets(
  accounts: Account[],
  changes: AccountArchiveChanges,
): Pick<ArchiveMutationPlan, 'archiveTargets' | 'unarchiveTargets'> {
  const toArchive = new Set(changes.toArchive);
  const toUnarchive = new Set(changes.toUnarchive);

  const archiveTargets = accounts.filter(
    account => toArchive.has(account.id as AccountId) && !account.archivedAt,
  );
  const unarchiveTargets = accounts.filter(
    account => toUnarchive.has(account.id as AccountId) && !!account.archivedAt,
  );

  return { archiveTargets, unarchiveTargets };
}

/** Prepare WatermelonDB update ops for archive/unarchive (for database.batch). */
export function prepareArchiveTargetOps(
  archiveTargets: Account[],
  unarchiveTargets: Account[],
  now: Date,
) {
  return [
    ...archiveTargets.map(account =>
      account.prepareUpdate(record => {
        record.archivedAt = now;
        record.updatedAt = now;
      }),
    ),
    ...unarchiveTargets.map(account =>
      account.prepareUpdate(record => {
        record.archivedAt = undefined;
        record.updatedAt = now;
      }),
    ),
  ];
}

export function collectArchiveAuditEntries(
  archiveTargets: { id: string; archivedAt?: Date }[],
  unarchiveTargets: { id: string; archivedAt?: Date }[],
  now: Date,
): ArchiveAuditEntry[] {
  const auditEntries: ArchiveAuditEntry[] = [];

  for (const account of archiveTargets) {
    auditEntries.push({
      entityId: account.id,
      beforeArchivedAt: account.archivedAt,
      afterArchivedAt: now,
      action: 'ARCHIVED',
    });
  }

  for (const account of unarchiveTargets) {
    auditEntries.push({
      entityId: account.id,
      beforeArchivedAt: account.archivedAt,
      afterArchivedAt: undefined,
      action: 'UNARCHIVED',
    });
  }

  return auditEntries;
}

export function trackArchiveAnalytics(
  archiveTargets: Account[],
  unarchiveTargets: Account[],
): void {
  if (archiveTargets.length > 0) {
    analytics.trackFeatureUsage('account', 'archive', {
      count: archiveTargets.length,
      account_type: archiveTargets[0]?.accountType,
    });
  }
  if (unarchiveTargets.length > 0) {
    analytics.trackFeatureUsage('account', 'unarchive', {
      count: unarchiveTargets.length,
      account_type: unarchiveTargets[0]?.accountType,
    });
  }
}
