import Account from '@/src/data/models/Account';
import {
  collectArchiveAuditEntries,
  partitionArchiveTargets,
  prepareArchiveTargetOps,
} from '@/src/services/accounts/accountArchiveMutations';
import { AccountId } from '@/src/types/domain';

function mockAccount(id: string, archivedAt?: Date) {
  const state: { archivedAt?: Date; updatedAt?: Date } = { archivedAt };
  return {
    id,
    get archivedAt() {
      return state.archivedAt;
    },
    set archivedAt(value: Date | undefined) {
      state.archivedAt = value;
    },
    prepareUpdate(mutator: (record: typeof state) => void) {
      mutator(state);
      return { id: `op-${id}` };
    },
  } as unknown as Account;
}

describe('accountArchiveMutations', () => {
  const archived = new Date('2026-01-01T00:00:00.000Z');
  const active = mockAccount('active');
  const archivedAccount = mockAccount('archived', archived);

  describe('partitionArchiveTargets', () => {
    it('includes only active accounts in archiveTargets', () => {
      const result = partitionArchiveTargets([active, archivedAccount], {
        toArchive: ['active' as AccountId, 'archived' as AccountId],
        toUnarchive: [],
      });

      expect(result.archiveTargets.map(a => a.id)).toEqual(['active']);
      expect(result.unarchiveTargets).toEqual([]);
    });

    it('includes only archived accounts in unarchiveTargets', () => {
      const result = partitionArchiveTargets([active, archivedAccount], {
        toArchive: [],
        toUnarchive: ['active' as AccountId, 'archived' as AccountId],
      });

      expect(result.archiveTargets).toEqual([]);
      expect(result.unarchiveTargets.map(a => a.id)).toEqual(['archived']);
    });

    it('returns empty targets when all ids are already in the desired state', () => {
      const result = partitionArchiveTargets([archivedAccount], {
        toArchive: ['archived' as AccountId],
        toUnarchive: [],
      });

      expect(result.archiveTargets).toEqual([]);
      expect(result.unarchiveTargets).toEqual([]);
    });
  });

  describe('collectArchiveAuditEntries', () => {
    it('records ARCHIVED and UNARCHIVED actions separately', () => {
      const now = new Date('2026-02-01T00:00:00.000Z');
      const entries = collectArchiveAuditEntries(
        [{ id: 'active', archivedAt: undefined }],
        [{ id: 'archived', archivedAt: archived }],
        now,
      );

      expect(entries).toEqual([
        expect.objectContaining({ entityId: 'active', action: 'ARCHIVED', afterArchivedAt: now }),
        expect.objectContaining({
          entityId: 'archived',
          action: 'UNARCHIVED',
          afterArchivedAt: undefined,
        }),
      ]);
    });
  });

  describe('prepareArchiveTargetOps', () => {
    it('sets archivedAt on archive targets and clears it on unarchive targets', () => {
      const now = new Date('2026-03-01T00:00:00.000Z');
      const ops = prepareArchiveTargetOps([active], [archivedAccount], now);

      expect(ops).toHaveLength(2);
      expect(active.archivedAt).toEqual(now);
      expect(archivedAccount.archivedAt).toBeUndefined();
    });
  });
});
