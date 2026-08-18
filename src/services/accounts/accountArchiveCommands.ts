import { persistBatch } from '@/src/data/repositories/persistBatch';
import AuditLog from '@/src/data/models/AuditLog';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import {
  ArchiveAuditEntry,
  ArchiveMutationPlan,
  collectArchiveAuditEntries,
  partitionArchiveTargets,
  prepareArchiveTargetOps,
  trackArchiveAnalytics,
} from '@/src/services/accounts/accountArchiveMutations';
import {
  PersistedArchiveAuditChanges,
  toPersistedIsoDate,
} from '@/src/services/accounts/accountAuditState';
import { AccountArchiveChanges } from '@/src/utils/accountArchive';
import { invalidateAccountArchiveCaches } from '@/src/services/reactive/invalidateAccountArchiveCaches';
import { AccountId, AuditAction, WorkplaceId } from '@/src/types/domain';

export type PreparedArchiveMutation = {
  plan: ArchiveMutationPlan;
  auditEntries: ArchiveAuditEntry[];
};

/** Canonical loader + partitioner for archive mutations. */
export async function prepareArchiveMutation(
  workplaceId: WorkplaceId,
  changes: AccountArchiveChanges,
): Promise<PreparedArchiveMutation | null> {
  const allIds = [...new Set([...changes.toArchive, ...changes.toUnarchive])] as AccountId[];
  if (allIds.length === 0) return null;

  const accounts = await accountRepository.findAllByIds(workplaceId, allIds);
  const foundIds = new Set(accounts.map(account => account.id));
  const missing = allIds.filter(id => !foundIds.has(id));
  if (missing.length > 0) {
    throw new Error(`Account(s) not found: ${missing.join(', ')}`);
  }

  const { archiveTargets, unarchiveTargets } = partitionArchiveTargets(accounts, changes);
  if (archiveTargets.length === 0 && unarchiveTargets.length === 0) return null;

  const now = new Date();
  return {
    plan: { archiveTargets, unarchiveTargets, now },
    auditEntries: collectArchiveAuditEntries(archiveTargets, unarchiveTargets, now),
  };
}

/** Serialize archive state for audit JSON (ISO strings; null = explicitly not archived). */
export function serializeArchiveAuditChanges(
  entry: ArchiveAuditEntry,
): PersistedArchiveAuditChanges {
  return {
    before: { archivedAt: toPersistedIsoDate(entry.beforeArchivedAt) },
    after: {
      archivedAt: toPersistedIsoDate(entry.afterArchivedAt),
      action: entry.action,
    },
  };
}

export function prepareArchiveAuditLogs(
  workplaceId: WorkplaceId,
  entries: ArchiveAuditEntry[],
): AuditLog[] {
  return entries.map(entry =>
    auditRepository.prepareLog(
      {
        entityType: 'account',
        entityId: entry.entityId,
        action: AuditAction.UPDATE,
        changes: serializeArchiveAuditChanges(entry),
      },
      workplaceId,
    ),
  );
}

/** Archive/unarchive immediately — standalone command (not bundled with form save). */
export async function applyAccountArchiveChanges(
  workplaceId: WorkplaceId,
  changes: AccountArchiveChanges,
): Promise<boolean> {
  const prepared = await prepareArchiveMutation(workplaceId, changes);
  if (!prepared) return false;

  const { archiveTargets, unarchiveTargets, now } = prepared.plan;
  await persistBatch([
    ...prepareArchiveTargetOps(archiveTargets, unarchiveTargets, now),
    ...prepareArchiveAuditLogs(workplaceId, prepared.auditEntries),
  ]);

  trackArchiveAnalytics(archiveTargets, unarchiveTargets);
  invalidateAccountArchiveCaches();
  return true;
}
